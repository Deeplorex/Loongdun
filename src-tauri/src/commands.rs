use std::path::{Path, PathBuf};

use tauri::State;

use crate::{
    backup,
    error::{CommandResult, command},
    generator,
    models::{
        AssetDetail, AssetFilter, AssetInput, AssetRelation, AssetRelationInput, AssetSummary,
        BackupInspection, Environment, EnvironmentInput, Folder, FolderInput, GeneratedPassword,
        GraphData, InitializeVaultResult, PasswordGeneratorOptions, Project, ProjectInput,
        RevealResult, Service, ServiceInput, UsageBinding, UsageBindingInput, VaultSettings,
        VaultStatus,
    },
    platform, storage,
    vault::AppState,
};

#[tauri::command]
pub async fn vault_status(state: State<'_, AppState>) -> CommandResult<VaultStatus> {
    command(Ok(state.status()))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn initialize_vault(
    state: State<'_, AppState>,
    vault_path: String,
    password: String,
) -> CommandResult<InitializeVaultResult> {
    command(state.initialize(PathBuf::from(vault_path), &password))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn unlock_vault(
    state: State<'_, AppState>,
    password: String,
    use_recovery: bool,
) -> CommandResult<VaultStatus> {
    command(state.unlock(&password, use_recovery))
}

#[tauri::command]
pub async fn unlock_with_system(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> CommandResult<VaultStatus> {
    let owner_window = command(platform::owner_window_handle(&window))?;
    command(state.unlock_with_system(owner_window).await)
}

#[tauri::command]
pub async fn enable_system_unlock(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> CommandResult<VaultStatus> {
    let owner_window = command(platform::owner_window_handle(&window))?;
    command(state.enable_system_unlock(owner_window).await)
}

#[tauri::command]
pub async fn disable_system_unlock(state: State<'_, AppState>) -> CommandResult<VaultStatus> {
    command(state.disable_system_unlock())
}

#[tauri::command]
pub async fn lock_vault(state: State<'_, AppState>) -> CommandResult<VaultStatus> {
    command(Ok(state.lock()))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn change_master_password(
    state: State<'_, AppState>,
    current_password: String,
    next_password: String,
) -> CommandResult<()> {
    command(state.change_master_password(&current_password, &next_password))
}

#[tauri::command]
pub async fn rotate_recovery_key(state: State<'_, AppState>) -> CommandResult<String> {
    command(state.rotate_recovery_key())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn generate_password(
    options: PasswordGeneratorOptions,
) -> CommandResult<GeneratedPassword> {
    command(generator::generate(&options))
}

#[tauri::command]
pub async fn list_assets(
    state: State<'_, AppState>,
    filter: AssetFilter,
) -> CommandResult<Vec<AssetSummary>> {
    command(state.with_session(|session| storage::list_assets(&session.connection, &filter)))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_asset(state: State<'_, AppState>, asset_id: String) -> CommandResult<AssetDetail> {
    command(state.with_session(|session| storage::get_asset(&session.connection, &asset_id)))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_asset_for_edit(
    state: State<'_, AppState>,
    asset_id: String,
) -> CommandResult<AssetInput> {
    command(
        state.with_session(|session| storage::get_asset_for_edit(&session.connection, &asset_id)),
    )
}

#[tauri::command]
pub async fn save_asset(
    state: State<'_, AppState>,
    input: AssetInput,
    links: Option<crate::models::AssetLinksInput>,
) -> CommandResult<AssetDetail> {
    command(state.with_session_mut(|session| match links {
        Some(links) => storage::save_asset_with_links(&mut session.connection, input, Some(links)),
        None => storage::save_asset(&mut session.connection, input),
    }))
}

#[tauri::command]
pub async fn list_folders(state: State<'_, AppState>) -> CommandResult<Vec<Folder>> {
    command(state.with_session(|session| storage::list_folders(&session.connection)))
}

#[tauri::command]
pub async fn save_folder(state: State<'_, AppState>, input: FolderInput) -> CommandResult<Folder> {
    command(state.with_session(|session| storage::save_folder(&session.connection, input)))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_folder(state: State<'_, AppState>, folder_id: String) -> CommandResult<()> {
    command(state.with_session(|session| storage::delete_folder(&session.connection, &folder_id)))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn trash_asset(state: State<'_, AppState>, asset_id: String) -> CommandResult<()> {
    command(state.with_session(|session| storage::trash_asset(&session.connection, &asset_id)))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn restore_asset(state: State<'_, AppState>, asset_id: String) -> CommandResult<()> {
    command(state.with_session(|session| storage::restore_asset(&session.connection, &asset_id)))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn purge_asset(state: State<'_, AppState>, asset_id: String) -> CommandResult<()> {
    command(
        state.with_session_mut(|session| storage::purge_asset(&mut session.connection, &asset_id)),
    )
}

#[tauri::command(rename_all = "camelCase")]
pub async fn reveal_secret(
    state: State<'_, AppState>,
    asset_id: String,
    field_key: String,
) -> CommandResult<RevealResult> {
    command(state.reveal_secret(&asset_id, &field_key))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn copy_secret(
    state: State<'_, AppState>,
    asset_id: String,
    field_key: String,
) -> CommandResult<()> {
    command(state.copy_secret(&asset_id, &field_key))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn add_attachment(
    state: State<'_, AppState>,
    asset_id: String,
    source_path: String,
    passphrase: String,
    expires_at: Option<String>,
) -> CommandResult<AssetDetail> {
    command(state.with_session(|session| {
        storage::add_attachment(
            &session.connection,
            &asset_id,
            Path::new(&source_path),
            &passphrase,
            expires_at,
        )
    }))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn export_attachment(
    state: State<'_, AppState>,
    attachment_id: String,
    target_path: String,
) -> CommandResult<()> {
    command(state.with_session(|session| {
        storage::export_attachment(&session.connection, &attachment_id, Path::new(&target_path))
    }))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_attachment(
    state: State<'_, AppState>,
    attachment_id: String,
) -> CommandResult<()> {
    command(
        state.with_session(|session| {
            storage::delete_attachment(&session.connection, &attachment_id)
        }),
    )
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> CommandResult<Vec<Project>> {
    command(state.with_session(|session| storage::list_projects(&session.connection)))
}

#[tauri::command]
pub async fn save_project(
    state: State<'_, AppState>,
    input: ProjectInput,
) -> CommandResult<Project> {
    command(state.with_session(|session| storage::save_project(&session.connection, input)))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_project(state: State<'_, AppState>, project_id: String) -> CommandResult<()> {
    command(state.with_session(|session| storage::delete_project(&session.connection, &project_id)))
}

#[tauri::command]
pub async fn save_service(
    state: State<'_, AppState>,
    input: ServiceInput,
) -> CommandResult<Service> {
    command(state.with_session(|session| storage::save_service(&session.connection, input)))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_service(state: State<'_, AppState>, service_id: String) -> CommandResult<()> {
    command(state.with_session(|session| storage::delete_service(&session.connection, &service_id)))
}

#[tauri::command]
pub async fn save_environment(
    state: State<'_, AppState>,
    input: EnvironmentInput,
) -> CommandResult<Environment> {
    command(state.with_session(|session| storage::save_environment(&session.connection, input)))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_environment(
    state: State<'_, AppState>,
    environment_id: String,
) -> CommandResult<()> {
    command(
        state.with_session(|session| {
            storage::delete_environment(&session.connection, &environment_id)
        }),
    )
}

#[tauri::command]
pub async fn save_binding(
    state: State<'_, AppState>,
    input: UsageBindingInput,
) -> CommandResult<UsageBinding> {
    command(state.with_session(|session| storage::save_binding(&session.connection, input)))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_binding(state: State<'_, AppState>, binding_id: String) -> CommandResult<()> {
    command(state.with_session(|session| storage::delete_binding(&session.connection, &binding_id)))
}

#[tauri::command]
pub async fn save_asset_relation(
    state: State<'_, AppState>,
    input: AssetRelationInput,
) -> CommandResult<AssetRelation> {
    command(state.with_session(|session| storage::save_asset_relation(&session.connection, input)))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_asset_relation(
    state: State<'_, AppState>,
    relation_id: String,
) -> CommandResult<()> {
    command(
        state.with_session(|session| {
            storage::delete_asset_relation(&session.connection, &relation_id)
        }),
    )
}

#[tauri::command(rename_all = "camelCase")]
pub async fn graph_data(
    state: State<'_, AppState>,
    _focus_id: Option<String>,
) -> CommandResult<GraphData> {
    command(state.with_session(|session| storage::graph_data(&session.connection)))
}

#[tauri::command]
pub async fn get_settings(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> CommandResult<VaultSettings> {
    let settings = command(state.get_settings())?;
    command(platform::apply_window_theme(&window, &settings.theme))?;
    Ok(settings)
}

#[tauri::command]
pub async fn save_settings(
    window: tauri::Window,
    state: State<'_, AppState>,
    settings: VaultSettings,
) -> CommandResult<VaultSettings> {
    let saved = command(state.save_settings(settings))?;
    command(platform::apply_window_theme(&window, &saved.theme))?;
    Ok(saved)
}

#[tauri::command]
pub async fn auto_backup(state: State<'_, AppState>) -> CommandResult<Option<String>> {
    command(state.auto_backup())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn export_backup(state: State<'_, AppState>, target_path: String) -> CommandResult<()> {
    command(state.with_session(|session| {
        backup::export_backup(
            &session.connection,
            &session.vault_dir,
            Path::new(&target_path),
        )
    }))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn inspect_backup(backup_path: String) -> CommandResult<BackupInspection> {
    command(backup::inspect_backup(Path::new(&backup_path)))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn restore_backup(
    state: State<'_, AppState>,
    backup_path: String,
    target_path: String,
    credential: String,
    use_recovery: bool,
) -> CommandResult<VaultStatus> {
    command(state.restore(
        Path::new(&backup_path),
        Path::new(&target_path),
        &credential,
        use_recovery,
    ))
}
