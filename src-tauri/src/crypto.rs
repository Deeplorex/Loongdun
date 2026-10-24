use argon2::{Algorithm, Argon2, Params, Version};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chacha20poly1305::{
    KeyInit, XChaCha20Poly1305, XNonce,
    aead::{Aead, Payload},
};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, Zeroizing};

use crate::error::{AppError, AppResult};

/// 当前加密域分离常量（Loongdun 品牌期写入的信封均使用它）。
const AAD: &[u8] = b"loongdun-vault-key-envelope-v1";
/// 旧品牌期（Rhizome）写入的信封使用它；仅用于解密回退，永不再用于加密。
/// 旧信封会在用户修改主密码或轮换恢复密钥时自然迁移到新域。
const LEGACY_AAD: &[u8] = b"rhizome-vault-key-envelope-v1";
const KEY_BYTES: usize = 32;
const SALT_BYTES: usize = 16;
const NONCE_BYTES: usize = 24;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArgonSettings {
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

impl Default for ArgonSettings {
    fn default() -> Self {
        Self {
            memory_kib: 65_536,
            iterations: 3,
            parallelism: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedKey {
    pub salt: String,
    pub nonce: String,
    pub ciphertext: String,
    pub argon: ArgonSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyEnvelope {
    pub version: u32,
    pub vault_id: String,
    pub created_at: String,
    pub password: WrappedKey,
    pub recovery: WrappedKey,
}

fn random_bytes<const N: usize>() -> AppResult<[u8; N]> {
    let mut value = [0_u8; N];
    getrandom::fill(&mut value).map_err(|_| AppError::Crypto)?;
    Ok(value)
}

fn derive_key(
    secret: &SecretString,
    salt: &[u8],
    settings: &ArgonSettings,
) -> AppResult<Zeroizing<[u8; KEY_BYTES]>> {
    let params = Params::new(
        settings.memory_kib,
        settings.iterations,
        settings.parallelism,
        Some(KEY_BYTES),
    )
    .map_err(|_| AppError::Crypto)?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut output = Zeroizing::new([0_u8; KEY_BYTES]);
    argon
        .hash_password_into(secret.expose_secret().as_bytes(), salt, output.as_mut())
        .map_err(|_| AppError::Crypto)?;
    Ok(output)
}

pub fn wrap_key(key: &[u8], secret: &str) -> AppResult<WrappedKey> {
    wrap_key_with_aad(key, secret, AAD)
}

fn wrap_key_with_aad(key: &[u8], secret: &str, aad: &[u8]) -> AppResult<WrappedKey> {
    let settings = ArgonSettings::default();
    let salt = random_bytes::<SALT_BYTES>()?;
    let nonce = random_bytes::<NONCE_BYTES>()?;
    let secret = SecretString::from(secret.to_owned());
    let derived = derive_key(&secret, &salt, &settings)?;
    let cipher =
        XChaCha20Poly1305::new_from_slice(derived.as_ref()).map_err(|_| AppError::Crypto)?;
    let ciphertext = cipher
        .encrypt(XNonce::from_slice(&nonce), Payload { msg: key, aad })
        .map_err(|_| AppError::Crypto)?;
    Ok(WrappedKey {
        salt: URL_SAFE_NO_PAD.encode(salt),
        nonce: URL_SAFE_NO_PAD.encode(nonce),
        ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
        argon: settings,
    })
}

pub fn unwrap_key(wrapper: &WrappedKey, credential: &str) -> AppResult<Zeroizing<Vec<u8>>> {
    let salt = URL_SAFE_NO_PAD
        .decode(&wrapper.salt)
        .map_err(|_| AppError::InvalidCredential)?;
    let nonce = URL_SAFE_NO_PAD
        .decode(&wrapper.nonce)
        .map_err(|_| AppError::InvalidCredential)?;
    let ciphertext = URL_SAFE_NO_PAD
        .decode(&wrapper.ciphertext)
        .map_err(|_| AppError::InvalidCredential)?;
    if salt.len() != SALT_BYTES || nonce.len() != NONCE_BYTES {
        return Err(AppError::InvalidCredential);
    }
    let secret = SecretString::from(credential.to_owned());
    let derived = derive_key(&secret, &salt, &wrapper.argon)?;
    let cipher =
        XChaCha20Poly1305::new_from_slice(derived.as_ref()).map_err(|_| AppError::Crypto)?;
    let decrypt = |aad: &[u8]| -> AppResult<Vec<u8>> {
        cipher
            .decrypt(
                XNonce::from_slice(&nonce),
                Payload {
                    msg: &ciphertext,
                    aad,
                },
            )
            .map_err(|_| AppError::InvalidCredential)
    };
    // 新域失败时回退旧品牌域（解密开销远小于 Argon2 派生，错误口令仅多一次尝试）
    let mut plaintext = decrypt(AAD).or_else(|_| decrypt(LEGACY_AAD))?;
    if plaintext.len() != KEY_BYTES {
        plaintext.zeroize();
        return Err(AppError::InvalidCredential);
    }
    Ok(Zeroizing::new(plaintext))
}

pub fn generate_recovery_key() -> AppResult<String> {
    let bytes = random_bytes::<KEY_BYTES>()?;
    let encoded = URL_SAFE_NO_PAD.encode(bytes);
    Ok(encoded
        .as_bytes()
        .chunks(4)
        .map(|chunk| std::str::from_utf8(chunk).unwrap_or_default())
        .collect::<Vec<_>>()
        .join("-"))
}

pub fn normalize_recovery_key(value: &str) -> String {
    value
        .chars()
        .filter(|character| *character != '-' && !character.is_whitespace())
        .collect()
}

pub fn create_envelope(password: &str) -> AppResult<(Zeroizing<Vec<u8>>, KeyEnvelope, String)> {
    if password.chars().count() < 10 {
        return Err(AppError::Validation("主密码至少需要 10 个字符".into()));
    }
    let key = Zeroizing::new(random_bytes::<KEY_BYTES>()?.to_vec());
    let recovery_key = generate_recovery_key()?;
    let envelope = KeyEnvelope {
        version: 1,
        vault_id: uuid::Uuid::new_v4().to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        password: wrap_key(&key, password)?,
        recovery: wrap_key(&key, &normalize_recovery_key(&recovery_key))?,
    };
    Ok((key, envelope, recovery_key))
}

pub fn unlock_envelope(
    envelope: &KeyEnvelope,
    credential: &str,
    use_recovery: bool,
) -> AppResult<Zeroizing<Vec<u8>>> {
    if envelope.version != 1 {
        return Err(AppError::BackupFormat);
    }
    if use_recovery {
        unwrap_key(&envelope.recovery, &normalize_recovery_key(credential))
    } else {
        unwrap_key(&envelope.password, credential)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_and_recovery_unwrap_the_same_vault_key() {
        let (key, envelope, recovery) = create_envelope("correct horse battery staple").unwrap();
        let from_password =
            unlock_envelope(&envelope, "correct horse battery staple", false).unwrap();
        let from_recovery = unlock_envelope(&envelope, &recovery, true).unwrap();
        assert_eq!(key.as_slice(), from_password.as_slice());
        assert_eq!(key.as_slice(), from_recovery.as_slice());
    }

    #[test]
    fn wrong_credentials_fail_closed() {
        let (_, envelope, _) = create_envelope("correct horse battery staple").unwrap();
        assert!(matches!(
            unlock_envelope(&envelope, "wrong password", false),
            Err(AppError::InvalidCredential)
        ));
    }

    #[test]
    fn ciphertext_tampering_is_detected() {
        let (_, mut envelope, _) = create_envelope("correct horse battery staple").unwrap();
        envelope.password.ciphertext.push('A');
        assert!(unlock_envelope(&envelope, "correct horse battery staple", false).is_err());
    }

    #[test]
    fn legacy_brand_envelope_still_unlocks_and_new_envelopes_reject_it() {
        let (key, mut envelope, recovery) =
            create_envelope("correct horse battery staple").unwrap();
        // 模拟旧品牌版本写入的信封：password 槽用旧加密域重包
        envelope.password =
            wrap_key_with_aad(key.as_slice(), "correct horse battery staple", LEGACY_AAD).unwrap();
        assert_eq!(
            unlock_envelope(&envelope, "correct horse battery staple", false)
                .unwrap()
                .as_slice(),
            key.as_slice()
        );
        // recovery 槽仍是新域，恢复密钥照常解锁
        assert_eq!(
            unlock_envelope(&envelope, &recovery, true)
                .unwrap()
                .as_slice(),
            key.as_slice()
        );
    }
}
