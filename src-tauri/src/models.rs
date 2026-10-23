use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    WebAccount,
    ApiCredential,
    Server,
    Database,
    Recovery,
    SecretFile,
}

impl AssetKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::WebAccount => "web_account",
            Self::ApiCredential => "api_credential",
            Self::Server => "server",
            Self::Database => "database",
            Self::Recovery => "recovery",
            Self::SecretFile => "secret_file",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "web_account" => Self::WebAccount,
            "api_credential" => Self::ApiCredential,
            "server" => Self::Server,
            "database" => Self::Database,
            "recovery" => Self::Recovery,
            "secret_file" => Self::SecretFile,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SecretFieldInput {
    pub key: String,
    pub label: String,
    pub value: String,
    pub sensitive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretFieldView {
    pub key: String,
    pub label: String,
    pub sensitive: bool,
    pub has_value: bool,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AssetListField {
    pub key: String,
    pub label: String,
    pub value: String,
    pub sensitive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetInput {
    pub id: Option<String>,
    pub kind: AssetKind,
    pub title: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub username_hint: String,
    #[serde(default)]
    pub environment: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub favorite: bool,
    pub expires_at: Option<String>,
    pub parent_asset_id: Option<String>,
    pub folder_id: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub fields: Vec<SecretFieldInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetLinksInput {
    pub relations: Vec<AssetRelationInput>,
    pub bindings: Vec<UsageBindingInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetSummary {
    pub id: String,
    pub kind: AssetKind,
    pub title: String,
    pub platform: String,
    pub username_hint: String,
    pub environment: String,
    pub favorite: bool,
    pub expires_at: Option<String>,
    pub parent_asset_id: Option<String>,
    pub folder_id: Option<String>,
    pub deleted_at: Option<String>,
    pub updated_at: String,
    pub tags: Vec<String>,
    pub core_fields: Vec<AssetListField>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetFilter {
    pub query: Option<String>,
    pub kind: Option<AssetKind>,
    pub folder_id: Option<String>,
    #[serde(default)]
    pub favorites_only: bool,
    #[serde(default)]
    pub include_deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInput {
    pub id: Option<String>,
    pub parent_id: Option<String>,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentMeta {
    pub id: String,
    pub asset_id: String,
    pub filename: String,
    pub format: String,
    pub fingerprint: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub has_passphrase: bool,
    pub expires_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConsumerKind {
    Project,
    Service,
    Environment,
}

impl ConsumerKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Project => "project",
            Self::Service => "service",
            Self::Environment => "environment",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "project" => Self::Project,
            "service" => Self::Service,
            "environment" => Self::Environment,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageBinding {
    pub id: String,
    pub asset_id: String,
    pub asset_title: String,
    pub consumer_kind: ConsumerKind,
    pub consumer_id: String,
    pub consumer_name: String,
    pub purpose: String,
    pub config_key: String,
    pub environment: String,
    pub notes: String,
    pub last_verified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageBindingInput {
    pub asset_id: String,
    pub consumer_kind: ConsumerKind,
    pub consumer_id: String,
    #[serde(default)]
    pub purpose: String,
    #[serde(default)]
    pub config_key: String,
    #[serde(default)]
    pub environment: String,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AssetRelationType {
    UsedToRegister,
    UsedToLogin,
    UsedToRecover,
    IssuesCredential,
    SharedAccount,
    Other,
}

impl AssetRelationType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::UsedToRegister => "used_to_register",
            Self::UsedToLogin => "used_to_login",
            Self::UsedToRecover => "used_to_recover",
            Self::IssuesCredential => "issues_credential",
            Self::SharedAccount => "shared_account",
            Self::Other => "other",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "used_to_register" => Self::UsedToRegister,
            "used_to_login" => Self::UsedToLogin,
            "used_to_recover" => Self::UsedToRecover,
            "issues_credential" => Self::IssuesCredential,
            "shared_account" => Self::SharedAccount,
            "other" => Self::Other,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRelation {
    pub id: String,
    pub source_asset_id: String,
    pub source_title: String,
    pub target_asset_id: String,
    pub target_title: String,
    pub relation_type: AssetRelationType,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRelationInput {
    pub source_asset_id: String,
    pub target_asset_id: String,
    pub relation_type: AssetRelationType,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDetail {
    pub summary: AssetSummary,
    pub notes: String,
    pub fields: Vec<SecretFieldView>,
    pub attachments: Vec<AttachmentMeta>,
    pub bindings: Vec<UsageBinding>,
    pub asset_relations: Vec<AssetRelation>,
    pub child_assets: Vec<AssetSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInput {
    #[serde(default)]
    pub logo: String,
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub repo_path: String,
    #[serde(default)]
    pub favorite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Service {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceInput {
    pub id: Option<String>,
    pub project_id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub id: String,
    pub project_id: String,
    pub service_id: Option<String>,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentInput {
    pub id: Option<String>,
    pub project_id: String,
    pub service_id: Option<String>,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    #[serde(default)]
    pub logo: String,
    pub id: String,
    pub name: String,
    pub description: String,
    pub repo_path: String,
    pub favorite: bool,
    pub updated_at: String,
    pub services: Vec<Service>,
    pub environments: Vec<Environment>,
    pub bindings: Vec<UsageBinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
    pub node_type: String,
    pub label: String,
    pub subtitle: String,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub state: String,
    pub vault_path: Option<String>,
    pub default_vault_path: String,
    pub system_unlock_available: bool,
    pub system_unlock_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeVaultResult {
    pub status: VaultStatus,
    pub recovery_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevealResult {
    pub value: String,
    pub expires_in_seconds: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordGeneratorOptions {
    pub length: u32,
    pub lowercase: bool,
    pub uppercase: bool,
    pub digits: bool,
    pub symbols: bool,
    pub exclude_ambiguous: bool,
    pub require_each_set: bool,
}

impl Default for PasswordGeneratorOptions {
    fn default() -> Self {
        Self {
            length: 20,
            lowercase: true,
            uppercase: true,
            digits: true,
            symbols: true,
            exclude_ambiguous: true,
            require_each_set: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedPassword {
    pub value: String,
    pub entropy_bits: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSettings {
    #[serde(default = "default_backup_interval")]
    pub auto_backup_hours: u32,
    #[serde(default)]
    pub password_generator: PasswordGeneratorOptions,
    #[serde(default)]
    pub auto_backup_directory: String,
    pub theme: String,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_close_behavior")]
    pub close_behavior: String,
    pub auto_lock_minutes: u32,
    pub reveal_seconds: u32,
    pub clipboard_seconds: u32,
}

fn default_backup_interval() -> u32 {
    24
}

fn default_language() -> String {
    "system".into()
}

fn default_close_behavior() -> String {
    "exit".into()
}

impl Default for VaultSettings {
    fn default() -> Self {
        Self {
            auto_backup_hours: default_backup_interval(),
            auto_backup_directory: String::new(),
            password_generator: PasswordGeneratorOptions::default(),
            theme: "system".into(),
            language: default_language(),
            close_behavior: default_close_behavior(),
            auto_lock_minutes: 5,
            reveal_seconds: 30,
            clipboard_seconds: 30,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInspection {
    pub version: u32,
    pub created_at: String,
    pub vault_id: String,
    pub database_bytes: u64,
}

#[cfg(test)]
mod tests {
    use super::{PasswordGeneratorOptions, VaultSettings};

    #[test]
    fn settings_created_before_language_support_follow_the_system() {
        let settings: VaultSettings = serde_json::from_str(
            r#"{"theme":"dark","autoLockMinutes":5,"revealSeconds":30,"clipboardSeconds":30}"#,
        )
        .unwrap();

        assert_eq!(settings.auto_backup_hours, 24);
        assert!(settings.auto_backup_directory.is_empty());
        assert_eq!(settings.language, "system");
        assert_eq!(settings.close_behavior, "exit");
        assert_eq!(
            settings.password_generator,
            PasswordGeneratorOptions::default()
        );
    }
}
