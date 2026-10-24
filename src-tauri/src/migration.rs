//! 品牌重塑迁移：把旧版 Rhizome 品牌留下的应用状态与默认库目录搬到 Loongdun 位置。
//!
//! 两个动作都在启动期、构建 AppState 之前执行，尽力而为且绝不删除用户数据：
//! 1. 配置目录迁移：应用标识符由 app.rhizome.vault 改为 com.deeplorex.loongdun 后，
//!    新配置目录没有 app-state.json 而旧目录有时，复制该定位文件（旧文件保留）；
//! 2. 默认库目录迁移：旧默认 {文档}/RhizomeVault 整目录改名为 {文档}/Deeplorex/Loongdun，
//!    并把定位文件指向新位置。定位文件指向其他自定义路径时不迁移；改名失败
//!    （目录被占用等）时保持旧位置，定位文件不改写，旧位置照常可用。

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::{platform, vault};

/// 旧版应用标识符，决定旧配置目录（如 Windows %APPDATA%\app.rhizome.vault）。
pub const LEGACY_APP_IDENTIFIER: &str = "app.rhizome.vault";
const LOCATOR_NAME: &str = "app-state.json";

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppLocator {
    last_vault_path: Option<String>,
}

/// 启动期迁移入口：`config_dir` 为新版配置目录，`vault_base_dir` 为默认库基目录。
pub fn migrate_legacy_state(config_dir: &Path, vault_base_dir: &Path) {
    migrate_locator(config_dir);
    migrate_default_vault(config_dir, vault_base_dir);
}

fn migrate_locator(config_dir: &Path) {
    let new_locator = config_dir.join(LOCATOR_NAME);
    if new_locator.exists() {
        return;
    }
    let Some(parent) = config_dir.parent() else {
        return;
    };
    let legacy_locator = parent.join(LEGACY_APP_IDENTIFIER).join(LOCATOR_NAME);
    if legacy_locator.is_file() && fs::create_dir_all(config_dir).is_ok() {
        let _ = fs::copy(&legacy_locator, &new_locator);
    }
}

/// 旧默认库目录 {文档}/RhizomeVault。
pub fn legacy_default_vault_dir(vault_base_dir: &Path) -> PathBuf {
    vault_base_dir.join(vault::LEGACY_VAULT_DIR_NAME)
}

fn migrate_default_vault(config_dir: &Path, vault_base_dir: &Path) {
    let legacy_vault = legacy_default_vault_dir(vault_base_dir);
    let target_vault = vault::default_vault_dir_under(vault_base_dir);
    if !legacy_vault.is_dir() || target_vault.exists() || !looks_like_vault(&legacy_vault) {
        return;
    }
    let locator_path = config_dir.join(LOCATOR_NAME);
    let remembered = fs::read_to_string(&locator_path)
        .ok()
        .and_then(|value| serde_json::from_str::<AppLocator>(&value).ok())
        .and_then(|locator| locator.last_vault_path);
    if let Some(path) = remembered.as_deref()
        && Path::new(path) != legacy_vault
    {
        // 定位文件指向自定义位置：旧默认目录只是遗留，交给用户处理
        return;
    }
    if let Some(parent) = target_vault.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if fs::rename(&legacy_vault, &target_vault).is_err() {
        return;
    }
    write_locator(&locator_path, &target_vault);
}

fn looks_like_vault(dir: &Path) -> bool {
    dir.join(vault::ENVELOPE_NAME).is_file()
}

fn write_locator(path: &Path, vault_dir: &Path) {
    let Ok(bytes) = serde_json::to_vec_pretty(&AppLocator {
        last_vault_path: Some(vault_dir.to_string_lossy().into_owned()),
    }) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let temporary = path.with_extension("json.partial");
    let Ok(mut output) = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&temporary)
    else {
        return;
    };
    if output.write_all(&bytes).is_err() || output.sync_all().is_err() {
        let _ = fs::remove_file(&temporary);
        return;
    }
    drop(output);
    let _ = platform::replace_file_atomic(&temporary, path);
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Layout {
        appdata: PathBuf,
        base: PathBuf,
        legacy_vault: PathBuf,
        target_vault: PathBuf,
    }

    fn layout(root: &Path) -> Layout {
        let appdata = root.join("appdata");
        let base = root.join("documents");
        Layout {
            legacy_vault: legacy_default_vault_dir(&base),
            target_vault: vault::default_vault_dir_under(&base),
            appdata,
            base,
        }
    }

    fn create_legacy_vault(layout: &Layout) {
        fs::create_dir_all(layout.legacy_vault.join("backups")).unwrap();
        fs::write(layout.legacy_vault.join(vault::ENVELOPE_NAME), "{}").unwrap();
        fs::write(layout.legacy_vault.join("vault.db"), "db").unwrap();
        fs::write(layout.legacy_vault.join("backups").join("old.bak"), "bak").unwrap();
    }

    fn new_config(layout: &Layout) -> PathBuf {
        layout.appdata.join("com.deeplorex.loongdun")
    }

    fn write_legacy_locator(layout: &Layout, vault_path: &Path) {
        let legacy_config = layout.appdata.join(LEGACY_APP_IDENTIFIER);
        fs::create_dir_all(&legacy_config).unwrap();
        fs::write(
            legacy_config.join(LOCATOR_NAME),
            serde_json::to_vec_pretty(&AppLocator {
                last_vault_path: Some(vault_path.to_string_lossy().into_owned()),
            })
            .unwrap(),
        )
        .unwrap();
    }

    fn read_locator(config_dir: &Path) -> AppLocator {
        serde_json::from_slice(&fs::read(config_dir.join(LOCATOR_NAME)).unwrap()).unwrap()
    }

    #[test]
    fn upgrade_moves_legacy_default_vault_and_locator() {
        let root = tempfile::tempdir().unwrap();
        let layout = layout(root.path());
        create_legacy_vault(&layout);
        write_legacy_locator(&layout, &layout.legacy_vault);

        migrate_legacy_state(&new_config(&layout), &layout.base);

        let config = new_config(&layout);
        assert_eq!(
            read_locator(&config).last_vault_path.as_deref(),
            Some(layout.target_vault.to_string_lossy().into_owned().as_str())
        );
        assert!(!layout.legacy_vault.exists());
        assert!(layout.target_vault.join(vault::ENVELOPE_NAME).is_file());
        assert!(layout.target_vault.join("vault.db").is_file());
        assert!(
            layout
                .target_vault
                .join("backups")
                .join("old.bak")
                .is_file()
        );
        // 旧配置目录的定位文件保留，便于回滚到旧版本
        assert!(
            layout
                .appdata
                .join(LEGACY_APP_IDENTIFIER)
                .join(LOCATOR_NAME)
                .is_file()
        );
    }

    #[test]
    fn custom_vault_locations_are_left_alone() {
        let root = tempfile::tempdir().unwrap();
        let layout = layout(root.path());
        create_legacy_vault(&layout);
        let custom = root.path().join("custom-vault");
        fs::create_dir(&custom).unwrap();
        write_legacy_locator(&layout, &custom);

        migrate_legacy_state(&new_config(&layout), &layout.base);

        assert!(layout.legacy_vault.exists());
        assert!(!layout.target_vault.exists());
        assert_eq!(
            read_locator(&new_config(&layout))
                .last_vault_path
                .as_deref(),
            Some(custom.to_string_lossy().into_owned().as_str())
        );
    }

    #[test]
    fn fresh_install_creates_nothing() {
        let root = tempfile::tempdir().unwrap();
        let layout = layout(root.path());

        migrate_legacy_state(&new_config(&layout), &layout.base);

        assert!(!layout.base.join("Deeplorex").exists());
        assert!(!new_config(&layout).join(LOCATOR_NAME).exists());
    }

    #[test]
    fn existing_target_wins_over_legacy_directory() {
        let root = tempfile::tempdir().unwrap();
        let layout = layout(root.path());
        create_legacy_vault(&layout);
        fs::create_dir_all(&layout.target_vault).unwrap();
        fs::write(layout.target_vault.join(vault::ENVELOPE_NAME), "new").unwrap();
        write_legacy_locator(&layout, &layout.legacy_vault);

        migrate_legacy_state(&new_config(&layout), &layout.base);

        assert!(layout.legacy_vault.join("vault.db").is_file());
        assert_eq!(
            fs::read_to_string(layout.target_vault.join(vault::ENVELOPE_NAME)).unwrap(),
            "new"
        );
        // 定位文件仍指旧目录，等待用户决断，不会被改写
        assert_eq!(
            read_locator(&new_config(&layout))
                .last_vault_path
                .as_deref(),
            Some(layout.legacy_vault.to_string_lossy().into_owned().as_str())
        );
    }

    #[test]
    fn folders_without_vault_marker_are_ignored() {
        let root = tempfile::tempdir().unwrap();
        let layout = layout(root.path());
        fs::create_dir_all(&layout.legacy_vault).unwrap();
        fs::write(layout.legacy_vault.join("notes.txt"), "not a vault").unwrap();

        migrate_legacy_state(&new_config(&layout), &layout.base);

        assert!(layout.legacy_vault.join("notes.txt").is_file());
        assert!(!layout.target_vault.exists());
    }

    #[test]
    fn legacy_vault_is_claimed_when_locator_is_missing() {
        let root = tempfile::tempdir().unwrap();
        let layout = layout(root.path());
        create_legacy_vault(&layout);

        migrate_legacy_state(&new_config(&layout), &layout.base);

        assert!(!layout.legacy_vault.exists());
        assert!(layout.target_vault.join(vault::ENVELOPE_NAME).is_file());
        assert_eq!(
            read_locator(&new_config(&layout))
                .last_vault_path
                .as_deref(),
            Some(layout.target_vault.to_string_lossy().into_owned().as_str())
        );
    }

    #[test]
    fn existing_new_locator_takes_precedence_over_legacy_one() {
        let root = tempfile::tempdir().unwrap();
        let layout = layout(root.path());
        create_legacy_vault(&layout);
        write_legacy_locator(&layout, &layout.legacy_vault);
        let config = new_config(&layout);
        fs::create_dir_all(&config).unwrap();
        let fresh_vault = root.path().join("fresh-vault");
        fs::write(
            config.join(LOCATOR_NAME),
            serde_json::to_vec_pretty(&AppLocator {
                last_vault_path: Some(fresh_vault.to_string_lossy().into_owned()),
            })
            .unwrap(),
        )
        .unwrap();

        migrate_legacy_state(&config, &layout.base);

        // 新定位文件已指向用户的新库：不复制旧定位文件，也不搬动旧默认库目录
        assert_eq!(
            read_locator(&config).last_vault_path.as_deref(),
            Some(fresh_vault.to_string_lossy().into_owned().as_str())
        );
        assert!(
            layout
                .appdata
                .join(LEGACY_APP_IDENTIFIER)
                .join(LOCATOR_NAME)
                .is_file()
        );
        assert!(layout.legacy_vault.join(vault::ENVELOPE_NAME).is_file());
        assert!(!layout.target_vault.exists());
    }
}
