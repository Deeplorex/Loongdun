use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use parking_lot::Mutex;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::{
    backup,
    crypto::{
        KeyEnvelope, create_envelope, generate_recovery_key, normalize_recovery_key,
        unlock_envelope, wrap_key,
    },
    error::{AppError, AppResult},
    generator,
    models::{InitializeVaultResult, RevealResult, VaultSettings, VaultStatus},
    platform,
    storage::{self, initialize_database, migrate, open_encrypted},
};

const DATABASE_NAME: &str = "vault.db";
/// 库目录的初始化标记文件：每个已初始化的库都有 key-envelope.json。
pub const ENVELOPE_NAME: &str = "key-envelope.json";
const SETTINGS_NAME: &str = "settings.json";
const SYSTEM_KEY_NAME: &str = "system-key.bin";
/// 公司品牌名，作为默认库位置的第一级目录（Deeplorex/Loongdun）。
pub const DEFAULT_VAULT_COMPANY_DIR: &str = "Deeplorex";
/// 产品名，作为默认库位置的第二级目录（Deeplorex/Loongdun）。
pub const DEFAULT_VAULT_PRODUCT_DIR: &str = "Loongdun";
/// 旧版（Rhizome 品牌）的默认库目录名，升级时由 migration 自动迁移。
pub const LEGACY_VAULT_DIR_NAME: &str = "RhizomeVault";

/// Suggested location for a fresh vault, following each platform's user
/// directory conventions (documents folder, then home directory).
pub fn default_vault_dir(app: &tauri::AppHandle) -> PathBuf {
    default_vault_dir_under(&platform::default_vault_base_dir(app))
}

/// 与 `default_vault_dir` 同一规则，但接受调用方给定的基目录（文档目录），
/// 供启动期迁移与测试复用。
pub fn default_vault_dir_under(base_dir: &Path) -> PathBuf {
    base_dir
        .join(DEFAULT_VAULT_COMPANY_DIR)
        .join(DEFAULT_VAULT_PRODUCT_DIR)
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppLocator {
    last_vault_path: Option<String>,
}

pub struct VaultSession {
    pub vault_dir: PathBuf,
    pub key: Zeroizing<Vec<u8>>,
    pub connection: Connection,
}

pub struct AppState {
    session: Mutex<Option<VaultSession>>,
    locator_path: PathBuf,
    default_vault_dir: PathBuf,
    last_vault: Mutex<Option<PathBuf>>,
    settings: Mutex<VaultSettings>,
}

impl AppState {
    pub fn new(app_config_dir: PathBuf, default_vault_dir: PathBuf) -> Self {
        let locator_path = app_config_dir.join("app-state.json");
        let last_vault = fs::read(&locator_path)
            .ok()
            .and_then(|value| serde_json::from_slice::<AppLocator>(&value).ok())
            .and_then(|locator| locator.last_vault_path.map(PathBuf::from));
        let settings = last_vault
            .as_deref()
            .map(Self::load_settings)
            .unwrap_or_default();
        Self {
            session: Mutex::new(None),
            locator_path,
            default_vault_dir,
            last_vault: Mutex::new(last_vault),
            settings: Mutex::new(settings),
        }
    }

    fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> AppResult<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let temporary = path.with_extension("json.partial");
        let bytes = serde_json::to_vec_pretty(value)?;
        let mut output = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&temporary)?;
        output.write_all(&bytes)?;
        output.sync_all()?;
        drop(output);
        platform::replace_file_atomic(&temporary, path)?;
        Ok(())
    }

    fn remember_vault(&self, path: &Path) -> AppResult<()> {
        let value = path.to_string_lossy().into_owned();
        Self::write_json_atomic(
            &self.locator_path,
            &AppLocator {
                last_vault_path: Some(value),
            },
        )?;
        *self.last_vault.lock() = Some(path.to_path_buf());
        Ok(())
    }

    fn current_vault_path(&self) -> AppResult<PathBuf> {
        self.last_vault
            .lock()
            .clone()
            .ok_or(AppError::Uninitialized)
    }

    fn envelope_path(vault_dir: &Path) -> PathBuf {
        vault_dir.join(ENVELOPE_NAME)
    }
    fn system_key_path(vault_dir: &Path) -> PathBuf {
        vault_dir.join(SYSTEM_KEY_NAME)
    }

    fn read_envelope(vault_dir: &Path) -> AppResult<KeyEnvelope> {
        Ok(serde_json::from_slice(&fs::read(Self::envelope_path(
            vault_dir,
        ))?)?)
    }

    fn load_settings(vault_dir: &Path) -> VaultSettings {
        fs::read(vault_dir.join(SETTINGS_NAME))
            .ok()
            .and_then(|value| serde_json::from_slice(&value).ok())
            .unwrap_or_default()
    }

    pub fn status(&self) -> VaultStatus {
        let (session_path, unlocked) = {
            let session = self.session.lock();
            (
                session.as_ref().map(|value| value.vault_dir.clone()),
                session.is_some(),
            )
        };
        let path = session_path.or_else(|| self.last_vault.lock().clone());
        let state = if unlocked {
            "unlocked"
        } else if path
            .as_ref()
            .is_some_and(|path| Self::envelope_path(path).exists())
        {
            "locked"
        } else {
            "uninitialized"
        };
        let enabled = path
            .as_ref()
            .is_some_and(|path| Self::system_key_path(path).exists());
        VaultStatus {
            state: state.into(),
            vault_path: path.map(|value| value.to_string_lossy().into_owned()),
            default_vault_path: self.default_vault_dir.to_string_lossy().into_owned(),
            system_unlock_available: platform::system_unlock_available(),
            system_unlock_enabled: enabled,
        }
    }

    pub fn initialize(
        &self,
        vault_dir: PathBuf,
        password: &str,
    ) -> AppResult<InitializeVaultResult> {
        if Self::envelope_path(&vault_dir).exists() || vault_dir.join(DATABASE_NAME).exists() {
            return Err(AppError::VaultExists);
        }
        if vault_dir.exists() && fs::read_dir(&vault_dir)?.next().is_some() {
            return Err(AppError::VaultExists);
        }
        fs::create_dir_all(&vault_dir)?;
        let (key, envelope, recovery_key) = create_envelope(password)?;
        Self::write_json_atomic(&Self::envelope_path(&vault_dir), &envelope)?;
        let connection =
            match initialize_database(&vault_dir.join(DATABASE_NAME), &key, &envelope.vault_id) {
                Ok(connection) => connection,
                Err(error) => {
                    let _ = fs::remove_file(Self::envelope_path(&vault_dir));
                    let _ = fs::remove_file(vault_dir.join(DATABASE_NAME));
                    return Err(error);
                }
            };
        let settings = VaultSettings::default();
        Self::write_json_atomic(&vault_dir.join(SETTINGS_NAME), &settings)?;
        self.remember_vault(&vault_dir)?;
        *self.settings.lock() = settings;
        *self.session.lock() = Some(VaultSession {
            vault_dir,
            key,
            connection,
        });
        Ok(InitializeVaultResult {
            status: self.status(),
            recovery_key,
        })
    }

    pub fn unlock(&self, credential: &str, use_recovery: bool) -> AppResult<VaultStatus> {
        let vault_dir = self.current_vault_path()?;
        let envelope = Self::read_envelope(&vault_dir)?;
        let key = unlock_envelope(&envelope, credential, use_recovery)?;
        let connection = open_encrypted(&vault_dir.join(DATABASE_NAME), &key)?;
        migrate(&connection)?;
        *self.settings.lock() = Self::load_settings(&vault_dir);
        *self.session.lock() = Some(VaultSession {
            vault_dir,
            key,
            connection,
        });
        Ok(self.status())
    }

    pub async fn unlock_with_system(&self, owner_window: isize) -> AppResult<VaultStatus> {
        let vault_dir = self.current_vault_path()?;
        let system_key_path = Self::system_key_path(&vault_dir);
        let key = Zeroizing::new(
            tauri::async_runtime::spawn_blocking(move || {
                platform::unlock_with_system(&system_key_path, owner_window)
            })
            .await
            .map_err(|_| AppError::Message("快速解锁任务意外终止".into()))??,
        );
        let connection = open_encrypted(&vault_dir.join(DATABASE_NAME), &key)?;
        migrate(&connection)?;
        *self.settings.lock() = Self::load_settings(&vault_dir);
        *self.session.lock() = Some(VaultSession {
            vault_dir,
            key,
            connection,
        });
        Ok(self.status())
    }

    pub fn lock(&self) -> VaultStatus {
        self.session.lock().take();
        self.status()
    }

    pub fn with_session<T>(
        &self,
        operation: impl FnOnce(&VaultSession) -> AppResult<T>,
    ) -> AppResult<T> {
        let session = self.session.lock();
        operation(session.as_ref().ok_or(AppError::Locked)?)
    }

    pub fn with_session_mut<T>(
        &self,
        operation: impl FnOnce(&mut VaultSession) -> AppResult<T>,
    ) -> AppResult<T> {
        let mut session = self.session.lock();
        operation(session.as_mut().ok_or(AppError::Locked)?)
    }

    pub fn change_master_password(&self, current: &str, next: &str) -> AppResult<()> {
        if next.chars().count() < 10 {
            return Err(AppError::Validation("新主密码至少需要 10 个字符".into()));
        }
        self.with_session(|session| {
            let mut envelope = Self::read_envelope(&session.vault_dir)?;
            let current_key = unlock_envelope(&envelope, current, false)?;
            if current_key.as_slice() != session.key.as_slice() {
                return Err(AppError::InvalidCredential);
            }
            envelope.password = wrap_key(&session.key, next)?;
            Self::write_json_atomic(&Self::envelope_path(&session.vault_dir), &envelope)
        })
    }

    pub fn rotate_recovery_key(&self) -> AppResult<String> {
        self.with_session(|session| {
            let mut envelope = Self::read_envelope(&session.vault_dir)?;
            let recovery_key = generate_recovery_key()?;
            envelope.recovery = wrap_key(&session.key, &normalize_recovery_key(&recovery_key))?;
            Self::write_json_atomic(&Self::envelope_path(&session.vault_dir), &envelope)?;
            Ok(recovery_key)
        })
    }

    pub fn reveal_secret(&self, asset_id: &str, field_key: &str) -> AppResult<RevealResult> {
        // Read the policy before taking the session lock. `get_settings` verifies the
        // session by locking it, so calling it from inside `with_session` deadlocks.
        let expires_in_seconds = self.settings.lock().reveal_seconds;
        self.with_session(|session| {
            Ok(RevealResult {
                value: storage::reveal_secret(&session.connection, asset_id, field_key)?,
                expires_in_seconds,
            })
        })
    }

    pub fn copy_secret(&self, asset_id: &str, field_key: &str) -> AppResult<()> {
        // Keep clipboard access and its expiry worker outside the database lock.
        let clipboard_seconds = self.settings.lock().clipboard_seconds;
        let value = self.with_session(|session| {
            storage::reveal_secret(&session.connection, asset_id, field_key)
        })?;
        platform::copy_with_expiry(value, clipboard_seconds)
    }

    pub async fn enable_system_unlock(&self, owner_window: isize) -> AppResult<VaultStatus> {
        let (system_key_path, vault_key) = self.with_session(|session| {
            Ok((
                Self::system_key_path(&session.vault_dir),
                Zeroizing::new(session.key.to_vec()),
            ))
        })?;
        tauri::async_runtime::spawn_blocking(move || {
            platform::enable_system_unlock(&system_key_path, &vault_key, owner_window)
        })
        .await
        .map_err(|_| AppError::Message("快速解锁任务意外终止".into()))??;
        Ok(self.status())
    }

    pub fn disable_system_unlock(&self) -> AppResult<VaultStatus> {
        let vault_dir = self.current_vault_path()?;
        platform::disable_system_unlock(&Self::system_key_path(&vault_dir))?;
        Ok(self.status())
    }

    pub fn get_settings(&self) -> AppResult<VaultSettings> {
        self.with_session(|_| Ok(self.settings.lock().clone()))
    }

    pub fn auto_backup(&self) -> AppResult<Option<String>> {
        let guard = self.session.lock();
        let Some(session) = guard.as_ref() else {
            return Ok(None);
        };
        let settings = self.settings.lock().clone();
        backup::export_if_due(
            &session.connection,
            &session.vault_dir,
            &settings,
            chrono::Utc::now().timestamp(),
        )
    }

    pub fn close_to_tray(&self) -> bool {
        self.settings.lock().close_behavior == "tray"
    }

    pub fn save_settings(&self, settings: VaultSettings) -> AppResult<VaultSettings> {
        generator::validate(&settings.password_generator)?;
        if ![0, 1, 24, 168].contains(&settings.auto_backup_hours)
            || (!settings.auto_backup_directory.is_empty()
                && !Path::new(&settings.auto_backup_directory).is_absolute())
            || !["system", "light", "dark"].contains(&settings.theme.as_str())
            || !["system", "zh-CN", "en-US"].contains(&settings.language.as_str())
            || !["exit", "tray"].contains(&settings.close_behavior.as_str())
            || ![0, 1, 3, 7, 14, 30].contains(&settings.expiry_reminder_days)
            || !(1..=120).contains(&settings.auto_lock_minutes)
            || !(5..=300).contains(&settings.reveal_seconds)
            || !(5..=300).contains(&settings.clipboard_seconds)
        {
            return Err(AppError::Validation("设置值超出允许范围".into()));
        }
        self.with_session(|session| {
            Self::write_json_atomic(&session.vault_dir.join(SETTINGS_NAME), &settings)
        })?;
        *self.settings.lock() = settings.clone();
        Ok(settings)
    }

    pub fn restore(
        &self,
        backup_path: &Path,
        target_dir: &Path,
        credential: &str,
        use_recovery: bool,
    ) -> AppResult<VaultStatus> {
        self.session.lock().take();
        let restored = backup::restore_backup(backup_path, target_dir, credential, use_recovery)?;
        let connection = open_encrypted(&restored.vault_dir.join(DATABASE_NAME), &restored.key)?;
        *self.settings.lock() = Self::load_settings(&restored.vault_dir);
        self.remember_vault(&restored.vault_dir)?;
        *self.session.lock() = Some(VaultSession {
            vault_dir: restored.vault_dir,
            key: restored.key,
            connection,
        });
        Ok(self.status())
    }
}

#[cfg(test)]
mod tests {
    use crate::models::{AssetInput, AssetKind, PasswordGeneratorOptions, SecretFieldInput};

    use super::*;

    #[test]
    fn automatic_backup_skips_locked_vault_and_resumes_after_unlock() {
        let root = tempfile::tempdir().unwrap();
        let state = AppState::new(
            root.path().join("config"),
            root.path().join("default-vault"),
        );
        assert!(state.auto_backup().unwrap().is_none());
        state
            .initialize(root.path().join("vault"), "test-password")
            .unwrap();
        assert!(
            state
                .save_settings(VaultSettings {
                    auto_backup_hours: 2,
                    ..Default::default()
                })
                .is_err()
        );
        state.lock();
        assert!(state.auto_backup().unwrap().is_none());
        state.unlock("test-password", false).unwrap();
        assert!(state.auto_backup().unwrap().is_some());
        assert!(state.auto_backup().unwrap().is_none());
    }

    #[test]
    fn close_behavior_persists_and_is_available_while_locked() {
        let root = tempfile::tempdir().unwrap();
        let config = root.path().join("config");
        let default_vault = root.path().join("default-vault");
        let state = AppState::new(config.clone(), default_vault.clone());
        assert!(!state.close_to_tray());
        state
            .initialize(root.path().join("vault"), "test-password")
            .unwrap();
        assert!(
            state
                .save_settings(VaultSettings {
                    close_behavior: "invalid".into(),
                    ..VaultSettings::default()
                })
                .is_err()
        );
        state
            .save_settings(VaultSettings {
                close_behavior: "tray".into(),
                ..VaultSettings::default()
            })
            .unwrap();
        state.lock();
        assert!(state.close_to_tray());
        assert!(AppState::new(config.clone(), default_vault).close_to_tray());
        state.unlock("test-password", false).unwrap();
        state.save_settings(VaultSettings::default()).unwrap();
        assert!(!AppState::new(config, root.path().join("default-vault")).close_to_tray());
    }

    #[test]
    fn expiry_reminder_days_is_validated_and_persists() {
        let root = tempfile::tempdir().unwrap();
        let config = root.path().join("config");
        let state = AppState::new(config.clone(), root.path().join("default-vault"));
        state
            .initialize(root.path().join("vault"), "test-password")
            .unwrap();
        assert!(
            state
                .save_settings(VaultSettings {
                    expiry_reminder_days: 8,
                    ..VaultSettings::default()
                })
                .is_err()
        );
        state
            .save_settings(VaultSettings {
                expiry_reminder_days: 14,
                ..VaultSettings::default()
            })
            .unwrap();
        assert_eq!(
            AppState::new(config, root.path().join("default-vault"))
                .settings
                .lock()
                .expiry_reminder_days,
            14
        );
    }

    #[test]
    fn uninitialized_status_reports_the_platform_default_vault_dir() {
        let root = tempfile::tempdir().unwrap();
        let default_vault = default_vault_dir_under(&root.path().join("Documents"));
        let state = AppState::new(root.path().join("config"), default_vault.clone());
        let status = state.status();
        assert_eq!(status.state, "uninitialized");
        assert!(status.vault_path.is_none());
        assert_eq!(
            status.default_vault_path,
            default_vault.to_string_lossy().into_owned()
        );

        // Initializing always uses the caller-provided directory, never the default.
        state
            .initialize(root.path().join("custom-vault"), "test-password")
            .unwrap();
        let status = state.status();
        assert_eq!(status.state, "unlocked");
        assert_eq!(
            status.vault_path.as_deref(),
            Some(
                root.path()
                    .join("custom-vault")
                    .to_string_lossy()
                    .into_owned()
                    .as_str()
            )
        );
    }

    #[test]
    fn secret_reveal_reads_policy_without_relocking_the_vault_session() {
        let root = tempfile::tempdir().unwrap();
        let state = AppState::new(
            root.path().join("config"),
            root.path().join("default-vault"),
        );
        state
            .initialize(root.path().join("vault"), "test-password")
            .unwrap();
        assert!(
            state
                .save_settings(VaultSettings {
                    reveal_seconds: 4,
                    ..VaultSettings::default()
                })
                .is_err()
        );
        let saved = state
            .save_settings(VaultSettings {
                language: "en-US".into(),
                reveal_seconds: 15,
                ..VaultSettings::default()
            })
            .unwrap();
        assert_eq!(saved.language, "en-US");
        let asset_id = state
            .with_session_mut(|session| {
                Ok(storage::save_asset(
                    &mut session.connection,
                    AssetInput {
                        id: None,
                        kind: AssetKind::ApiCredential,
                        title: "Test API".into(),
                        platform: "Example".into(),
                        username_hint: String::new(),
                        environment: String::new(),
                        notes: String::new(),
                        favorite: false,
                        expires_at: None,
                        parent_asset_id: None,
                        folder_id: None,
                        tags: vec![],
                        fields: vec![SecretFieldInput {
                            key: "token".into(),
                            label: "Token".into(),
                            value: "test-secret".into(),
                            sensitive: true,
                        }],
                    },
                )?
                .summary
                .id)
            })
            .unwrap();

        let revealed = state.reveal_secret(&asset_id, "token").unwrap();
        assert_eq!(revealed.value, "test-secret");
        assert_eq!(revealed.expires_in_seconds, 15);
    }

    #[test]
    fn settings_reject_an_unknown_interface_language() {
        let state = AppState::new(
            tempfile::tempdir().unwrap().path().join("config"),
            tempfile::tempdir().unwrap().path().join("default-vault"),
        );
        assert!(
            state
                .save_settings(VaultSettings {
                    language: "fr-FR".into(),
                    ..VaultSettings::default()
                })
                .is_err()
        );
    }

    #[test]
    fn settings_reject_invalid_generator_rules() {
        let root = tempfile::tempdir().unwrap();
        let state = AppState::new(
            root.path().join("config"),
            root.path().join("default-vault"),
        );
        state
            .initialize(root.path().join("vault"), "test-password")
            .unwrap();
        assert!(
            state
                .save_settings(VaultSettings {
                    password_generator: PasswordGeneratorOptions {
                        length: 4,
                        ..PasswordGeneratorOptions::default()
                    },
                    ..VaultSettings::default()
                })
                .is_err()
        );
        state.save_settings(VaultSettings::default()).unwrap();
    }
}
