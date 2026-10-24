//! 按系统界面语言选择应用显示名：中文系统显示“龙盾”，其他语言沿用 "Loongdun"。
//! 仅影响窗口标题、托盘提示、托盘菜单与 NSIS 安装快捷方式/卸载项的显示名，
//! 不改变 productName、安装目录或应用标识符。

pub const CHINESE_APP_NAME: &str = "龙盾";
pub const DEFAULT_APP_NAME: &str = "Loongdun";

/// Windows 主语言 ID（LANGID 低 10 位）里的中文。
const CHINESE_PRIMARY_LANGUAGE_ID: u32 = 0x04;
const PRIMARY_LANGUAGE_ID_MASK: u32 = 0x3FF;

pub fn is_chinese_ui_language(language_id: u32) -> bool {
    (language_id & PRIMARY_LANGUAGE_ID_MASK) == CHINESE_PRIMARY_LANGUAGE_ID
}

pub fn app_display_name(language_id: u32) -> &'static str {
    if is_chinese_ui_language(language_id) {
        CHINESE_APP_NAME
    } else {
        DEFAULT_APP_NAME
    }
}

/// 当前系统界面语言下的应用显示名，供错误提示、系统对话框等运行期文案使用，
/// 避免在文案里硬编码品牌词。
pub fn current_app_display_name() -> &'static str {
    app_display_name(user_default_ui_language())
}

#[cfg(windows)]
#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetUserDefaultUILanguage() -> u16;
}

/// 与 installer-hooks.nsh 使用同一 API 判定系统界面语言，避免两边口径不一致。
#[cfg(windows)]
pub fn user_default_ui_language() -> u32 {
    unsafe { GetUserDefaultUILanguage() as u32 }
}

/// 非 Windows 平台保持默认名称。
#[cfg(not(windows))]
pub fn user_default_ui_language() -> u32 {
    0x0409
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chinese_language_variants_use_chinese_name() {
        for language_id in [0x0804, 0x0404, 0x0C04, 0x1004, 0x1404] {
            assert!(is_chinese_ui_language(language_id), "{language_id:#x}");
            assert_eq!(app_display_name(language_id), CHINESE_APP_NAME);
        }
    }

    #[test]
    fn other_languages_keep_default_name() {
        for language_id in [0x0409, 0x0809, 0x0411, 0x040C, 0x0412] {
            assert!(!is_chinese_ui_language(language_id), "{language_id:#x}");
            assert_eq!(app_display_name(language_id), DEFAULT_APP_NAME);
        }
    }

    #[test]
    fn current_name_follows_the_actual_ui_language() {
        assert_eq!(
            current_app_display_name(),
            app_display_name(user_default_ui_language())
        );
    }
}
