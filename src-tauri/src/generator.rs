use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};
use crate::models::{GeneratedPassword, PasswordGeneratorOptions};

const LOWERCASE: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
const UPPERCASE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS: &[u8] = b"0123456789";
const SYMBOLS: &[u8] = b"!@#$%^&*()[]{}?.~_+-=";
const AMBIGUOUS: &[u8] = b"il1I|0Oo";

const MIN_LENGTH: u32 = 8;
const MAX_LENGTH: u32 = 128;
// Whole-password resampling until every selected set appears is expected to
// succeed on the first try; the cap only guards against a broken RNG.
const MAX_RESAMPLE_ATTEMPTS: u32 = 10_000;

pub fn validate(options: &PasswordGeneratorOptions) -> AppResult<()> {
    if !(MIN_LENGTH..=MAX_LENGTH).contains(&options.length) {
        return Err(AppError::Validation("密码长度需在 8 到 128 之间".into()));
    }
    if !options.lowercase && !options.uppercase && !options.digits && !options.symbols {
        return Err(AppError::Validation("至少需要选择一类字符".into()));
    }
    if options.require_each_set && options.length < enabled_sets(options).len() as u32 {
        return Err(AppError::Validation("密码长度不足以包含每类字符".into()));
    }
    Ok(())
}

pub fn generate(options: &PasswordGeneratorOptions) -> AppResult<GeneratedPassword> {
    validate(options)?;
    let sets = enabled_sets(options);
    let pool: Vec<u8> = sets.iter().flatten().copied().collect();
    for _ in 0..MAX_RESAMPLE_ATTEMPTS {
        let candidate = sample_password(&pool, options.length)?;
        if !options.require_each_set
            || sets
                .iter()
                .all(|set| candidate.bytes().any(|character| set.contains(&character)))
        {
            return Ok(GeneratedPassword {
                entropy_bits: options.length as f64 * (pool.len() as f64).log2(),
                value: candidate.to_string(),
            });
        }
    }
    Err(AppError::Crypto)
}

fn enabled_sets(options: &PasswordGeneratorOptions) -> Vec<Vec<u8>> {
    let selected = [
        (options.lowercase, LOWERCASE),
        (options.uppercase, UPPERCASE),
        (options.digits, DIGITS),
        (options.symbols, SYMBOLS),
    ]
    .into_iter()
    .filter(|(enabled, _)| *enabled)
    .map(|(_, set)| set.to_vec())
    .collect::<Vec<_>>();
    if options.exclude_ambiguous {
        selected
            .into_iter()
            .map(|set| {
                set.into_iter()
                    .filter(|character| !AMBIGUOUS.contains(character))
                    .collect()
            })
            .collect()
    } else {
        selected
    }
}

/// Uniformly samples `length` characters from `pool` using rejection sampling
/// over random bytes, which removes the modulo bias of a plain `% pool_len()`.
fn sample_password(pool: &[u8], length: u32) -> AppResult<Zeroizing<String>> {
    let usable = 256 - (256 % pool.len());
    let mut output = Zeroizing::new(String::with_capacity(length as usize));
    let mut buffer = [0_u8; 64];
    let mut cursor = buffer.len();
    while output.len() < length as usize {
        if cursor == buffer.len() {
            getrandom::fill(&mut buffer).map_err(|_| AppError::Crypto)?;
            cursor = 0;
        }
        let byte = buffer[cursor];
        cursor += 1;
        if (byte as usize) < usable {
            output.push(char::from(pool[byte as usize % pool.len()]));
        }
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_passwords_honor_the_requested_rules() {
        let options = PasswordGeneratorOptions::default();
        let result = generate(&options).unwrap();
        let sets = enabled_sets(&options);
        let pool: Vec<u8> = sets.iter().flatten().copied().collect();

        assert_eq!(result.value.chars().count(), 20);
        assert!(
            result
                .value
                .bytes()
                .all(|character| pool.contains(&character))
        );
        assert!(
            result
                .value
                .bytes()
                .all(|character| !AMBIGUOUS.contains(&character))
        );
        for set in &sets {
            assert!(
                result
                    .value
                    .bytes()
                    .any(|character| set.contains(&character))
            );
        }
    }

    #[test]
    fn ambiguous_exclusion_is_optional() {
        let options = PasswordGeneratorOptions {
            exclude_ambiguous: false,
            length: 128,
            ..PasswordGeneratorOptions::default()
        };
        let result = generate(&options).unwrap();
        let pool: Vec<u8> = enabled_sets(&options).iter().flatten().copied().collect();
        assert!(
            result
                .value
                .bytes()
                .all(|character| pool.contains(&character))
        );
    }

    #[test]
    fn generator_rejects_invalid_rules() {
        let too_short = PasswordGeneratorOptions {
            length: MIN_LENGTH - 1,
            ..PasswordGeneratorOptions::default()
        };
        assert!(matches!(generate(&too_short), Err(AppError::Validation(_))));

        let too_long = PasswordGeneratorOptions {
            length: MAX_LENGTH + 1,
            ..PasswordGeneratorOptions::default()
        };
        assert!(matches!(generate(&too_long), Err(AppError::Validation(_))));

        let no_charset = PasswordGeneratorOptions {
            lowercase: false,
            uppercase: false,
            digits: false,
            symbols: false,
            ..PasswordGeneratorOptions::default()
        };
        assert!(matches!(
            generate(&no_charset),
            Err(AppError::Validation(_))
        ));
        assert!(
            validate(&no_charset)
                .unwrap_err()
                .to_string()
                .contains("至少需要选择一类字符")
        );
    }

    #[test]
    fn entropy_tracks_the_character_pool() {
        let options = PasswordGeneratorOptions {
            length: 16,
            symbols: false,
            exclude_ambiguous: false,
            ..PasswordGeneratorOptions::default()
        };
        let expected = 16.0 * 62.0_f64.log2();
        assert!((generate(&options).unwrap().entropy_bits - expected).abs() < 1e-9);
    }

    #[test]
    fn repeated_generation_produces_distinct_values() {
        let options = PasswordGeneratorOptions::default();
        let mut seen = std::collections::HashSet::new();
        for _ in 0..64 {
            seen.insert(generate(&options).unwrap().value);
        }
        assert_eq!(seen.len(), 64);
    }
}
