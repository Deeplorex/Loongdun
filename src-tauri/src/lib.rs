mod backup;
mod branding;
mod commands;
mod crypto;
mod error;
mod generator;
mod migration;
mod models;
mod platform;
mod storage;
mod vault;

use tauri::Manager;

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            std::fs::create_dir_all(&config_dir)?;
            let vault_base_dir = platform::default_vault_base_dir(app.handle());
            migration::migrate_legacy_state(&config_dir, &vault_base_dir);
            app.manage(vault::AppState::new(
                config_dir,
                vault::default_vault_dir(app.handle()),
            ));
            let ui_language = branding::user_default_ui_language();
            let app_name = branding::app_display_name(ui_language);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(app_name);
            }
            let open_label = if branding::is_chinese_ui_language(ui_language) {
                format!("打开{} / Open", app_name)
            } else {
                format!("打开 / Open {app_name}")
            };
            let open = tauri::menu::MenuItem::with_id(app, "open", open_label, true, None::<&str>)?;
            let exit =
                tauri::menu::MenuItem::with_id(app, "exit", "退出 / Exit", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&open, &exit])?;
            let mut tray = tauri::tray::TrayIconBuilder::with_id("main-tray")
                .tooltip(app_name)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "exit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            ..
                        }
                    ) {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<vault::AppState>().close_to_tray() {
                    if window.hide().is_ok() {
                        api.prevent_close();
                    }
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault_status,
            commands::initialize_vault,
            commands::unlock_vault,
            commands::unlock_with_system,
            commands::enable_system_unlock,
            commands::disable_system_unlock,
            commands::lock_vault,
            commands::change_master_password,
            commands::rotate_recovery_key,
            commands::generate_password,
            commands::list_assets,
            commands::get_asset,
            commands::get_asset_for_edit,
            commands::save_asset,
            commands::list_folders,
            commands::save_folder,
            commands::delete_folder,
            commands::trash_asset,
            commands::restore_asset,
            commands::purge_asset,
            commands::reveal_secret,
            commands::copy_secret,
            commands::add_attachment,
            commands::export_attachment,
            commands::delete_attachment,
            commands::list_projects,
            commands::save_project,
            commands::delete_project,
            commands::save_service,
            commands::delete_service,
            commands::save_environment,
            commands::delete_environment,
            commands::save_binding,
            commands::delete_binding,
            commands::save_asset_relation,
            commands::delete_asset_relation,
            commands::graph_data,
            commands::get_settings,
            commands::save_settings,
            commands::auto_backup,
            commands::export_backup,
            commands::inspect_backup,
            commands::restore_backup,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Loongdun")
        .run(|app_handle, event| {
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                let state = app_handle.state::<vault::AppState>();
                state.lock();
            }
        });
}
