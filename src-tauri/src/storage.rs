use std::{fs, io::Write, path::Path};

use base64::{Engine as _, engine::general_purpose::STANDARD_NO_PAD};
use chrono::Utc;
use rusqlite::{
    Connection, OptionalExtension, Row, Transaction, params, params_from_iter, types::Value,
};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use zeroize::Zeroize;

use crate::{
    error::{AppError, AppResult},
    models::{
        AssetDetail, AssetFilter, AssetInput, AssetKind, AssetListField, AssetRelation,
        AssetRelationInput, AssetRelationType, AssetSummary, AttachmentMeta, ConsumerKind,
        Environment, EnvironmentInput, Folder, FolderInput, GraphData, GraphEdge, GraphNode,
        Project, ProjectInput, SecretFieldInput, SecretFieldView, Service, ServiceInput,
        UsageBinding, UsageBindingInput,
    },
};

const MIGRATION_1: &str = include_str!("../migrations/0001_init.sql");
const MIGRATION_2: &str = include_str!("../migrations/0002_asset_relations.sql");
const MIGRATION_3: &str = include_str!("../migrations/0003_project_logo.sql");
const ATTACHMENT_LIMIT: u64 = 10 * 1024 * 1024;

pub fn open_encrypted(path: &Path, key: &[u8]) -> AppResult<Connection> {
    crate::platform::prepare_memory_lock_quota();
    let connection = Connection::open(path)?;
    let encoded = hex::encode(key);
    connection.execute_batch(&format!(
        "PRAGMA key = \"x'{encoded}'\";\nPRAGMA cipher_memory_security = ON;\nPRAGMA foreign_keys = ON;\nPRAGMA journal_mode = WAL;\nPRAGMA synchronous = FULL;\nPRAGMA secure_delete = ON;"
    ))?;
    connection
        .query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))
        .map_err(|_| AppError::InvalidCredential)?;
    Ok(connection)
}

pub fn initialize_database(path: &Path, key: &[u8], vault_id: &str) -> AppResult<Connection> {
    let connection = open_encrypted(path, key)?;
    migrate(&connection)?;
    connection.execute(
        "INSERT OR REPLACE INTO vault_meta(key, value) VALUES ('vault_id', ?1)",
        [vault_id],
    )?;
    Ok(connection)
}

pub fn migrate(connection: &Connection) -> AppResult<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);",
    )?;
    let current: i64 = connection.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;
    if current < 1 {
        connection.execute_batch(MIGRATION_1)?;
        connection.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
    }
    if current < 2 {
        connection.execute_batch(MIGRATION_2)?;
        connection.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (2, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
    }
    if current < 3 {
        let transaction = connection.unchecked_transaction()?;
        transaction.execute_batch(MIGRATION_3)?;
        transaction.execute(
            "INSERT INTO schema_migrations(version, applied_at) VALUES (3, ?1)",
            [Utc::now().to_rfc3339()],
        )?;
        transaction.commit()?;
    }
    Ok(())
}

fn row_to_summary(row: &Row<'_>) -> rusqlite::Result<AssetSummary> {
    let kind: String = row.get(1)?;
    let tags_json: String = row.get(12)?;
    let payload_json: String = row.get(13)?;
    let core_fields = serde_json::from_str::<Vec<SecretFieldInput>>(&payload_json)
        .unwrap_or_default()
        .into_iter()
        .filter(|field| !field.value.trim().is_empty())
        .map(|field| {
            let value = if field.sensitive {
                masked_field_preview(&field.key, &field.value)
            } else {
                field.value.clone()
            };
            AssetListField {
                key: field.key,
                label: field.label,
                value,
                sensitive: field.sensitive,
            }
        })
        .collect();
    Ok(AssetSummary {
        id: row.get(0)?,
        kind: AssetKind::parse(&kind).ok_or(rusqlite::Error::InvalidQuery)?,
        title: row.get(2)?,
        platform: row.get(3)?,
        username_hint: row.get(4)?,
        environment: row.get(5)?,
        favorite: row.get::<_, i64>(6)? != 0,
        expires_at: row.get(7)?,
        parent_asset_id: row.get(8)?,
        folder_id: row.get(9)?,
        deleted_at: row.get(10)?,
        updated_at: row.get(11)?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        core_fields,
    })
}

fn masked_field_preview(field_key: &str, value: &str) -> String {
    const FULLY_MASKED_FIELDS: &[&str] = &[
        "password",
        "pin",
        "totp_secret",
        "backup_codes",
        "recovery_code",
        "security_answer",
        "private_key",
        "passphrase",
        "key_passphrase",
    ];
    if FULLY_MASKED_FIELDS.contains(&field_key) {
        return "••••••••".into();
    }
    let characters = value.trim().chars().collect::<Vec<_>>();
    if characters.len() <= 8 {
        return "••••••••".into();
    }
    let prefix = characters.iter().take(4).collect::<String>();
    let suffix = characters
        .iter()
        .skip(characters.len().saturating_sub(4))
        .collect::<String>();
    format!("{prefix}••••{suffix}")
}

const SUMMARY_COLUMNS: &str = "a.id, a.kind, a.title, a.platform, a.username_hint, a.environment, a.favorite, a.expires_at, a.parent_asset_id, a.folder_id, a.deleted_at, a.updated_at, a.tags_json, a.payload_json";

fn like_pattern(value: &str) -> String {
    let escaped = value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}

pub fn list_assets(connection: &Connection, filter: &AssetFilter) -> AppResult<Vec<AssetSummary>> {
    let mut sql = format!("SELECT {SUMMARY_COLUMNS} FROM assets a");
    let mut conditions = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    if let Some(query) = filter
        .query
        .as_deref()
        .map(str::trim)
        .filter(|query| !query.is_empty())
    {
        const SEARCH_COLUMNS: [&str; 6] = [
            "a.title",
            "a.platform",
            "a.username_hint",
            "a.environment",
            "a.notes",
            "a.tags_json",
        ];
        for term in query.split_whitespace() {
            let term_conditions = SEARCH_COLUMNS
                .map(|column| format!("{column} LIKE ? ESCAPE '\\'"))
                .join(" OR ");
            conditions.push(format!("({term_conditions})"));
            for _ in SEARCH_COLUMNS {
                values.push(Value::Text(like_pattern(term)));
            }
        }
    }
    if let Some(kind) = &filter.kind {
        conditions.push("a.kind = ?".to_string());
        values.push(Value::Text(kind.as_str().into()));
    }
    if let Some(folder_id) = &filter.folder_id {
        conditions.push("a.folder_id = ?".to_string());
        values.push(Value::Text(folder_id.clone()));
    }
    if filter.favorites_only {
        conditions.push("a.favorite = 1".to_string());
    }
    if !filter.include_deleted {
        conditions.push("a.deleted_at IS NULL".to_string());
    }
    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }
    sql.push_str(" ORDER BY a.favorite DESC, a.updated_at DESC, a.title COLLATE NOCASE");
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(values), row_to_summary)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_folders(connection: &Connection) -> AppResult<Vec<Folder>> {
    let mut statement =
        connection.prepare("SELECT id,parent_id,name FROM folders ORDER BY name COLLATE NOCASE")?;
    let rows = statement.query_map([], |row| {
        Ok(Folder {
            id: row.get(0)?,
            parent_id: row.get(1)?,
            name: row.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn save_folder(connection: &Connection, input: FolderInput) -> AppResult<Folder> {
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("文件夹名称不能为空".into()));
    }
    if let Some(parent_id) = &input.parent_id {
        if input.id.as_ref() == Some(parent_id) {
            return Err(AppError::Validation("文件夹不能属于自身".into()));
        }
        let parent_exists: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM folders WHERE id=?1)",
            [parent_id],
            |row| row.get(0),
        )?;
        if !parent_exists {
            return Err(AppError::NotFound);
        }
    }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO folders(id,parent_id,name,created_at,updated_at) VALUES (?1,?2,?3,?4,?4) ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id,name=excluded.name,updated_at=excluded.updated_at",
        params![id, input.parent_id, input.name.trim(), now],
    )?;
    Ok(Folder {
        id,
        parent_id: input.parent_id,
        name: input.name.trim().into(),
    })
}

pub fn delete_folder(connection: &Connection, folder_id: &str) -> AppResult<()> {
    if connection.execute("DELETE FROM folders WHERE id=?1", [folder_id])? == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

fn get_summary(connection: &Connection, asset_id: &str) -> AppResult<AssetSummary> {
    let sql = format!("SELECT {SUMMARY_COLUMNS} FROM assets a WHERE a.id = ?1");
    connection
        .query_row(&sql, [asset_id], row_to_summary)
        .optional()?
        .ok_or(AppError::NotFound)
}

pub fn get_asset_for_edit(connection: &Connection, asset_id: &str) -> AppResult<AssetInput> {
    connection
        .query_row(
            "SELECT id, kind, title, platform, username_hint, environment, notes, favorite, expires_at, parent_asset_id, folder_id, tags_json, payload_json FROM assets WHERE id = ?1",
            [asset_id],
            |row| {
                let kind: String = row.get(1)?;
                let tags: String = row.get(11)?;
                let payload: String = row.get(12)?;
                Ok(AssetInput {
                    id: row.get(0)?,
                    kind: AssetKind::parse(&kind).ok_or(rusqlite::Error::InvalidQuery)?,
                    title: row.get(2)?,
                    platform: row.get(3)?,
                    username_hint: row.get(4)?,
                    environment: row.get(5)?,
                    notes: row.get(6)?,
                    favorite: row.get::<_, i64>(7)? != 0,
                    expires_at: row.get(8)?,
                    parent_asset_id: row.get(9)?,
                    folder_id: row.get(10)?,
                    tags: serde_json::from_str(&tags).unwrap_or_default(),
                    fields: serde_json::from_str(&payload).unwrap_or_default(),
                })
            },
        )
        .optional()?
        .ok_or(AppError::NotFound)
}

fn validate_asset(input: &AssetInput) -> AppResult<()> {
    if input.title.trim().is_empty() || input.title.chars().count() > 200 {
        return Err(AppError::Validation("名称需要 1–200 个字符".into()));
    }
    let mut keys = std::collections::HashSet::new();
    for field in &input.fields {
        if field.key.trim().is_empty() || !keys.insert(field.key.as_str()) {
            return Err(AppError::Validation("字段标识不能为空或重复".into()));
        }
    }
    Ok(())
}

fn sync_tags(transaction: &Transaction<'_>, asset_id: &str, tags: &[String]) -> AppResult<()> {
    transaction.execute("DELETE FROM asset_tags WHERE asset_id = ?1", [asset_id])?;
    for tag in tags
        .iter()
        .map(|tag| tag.trim())
        .filter(|tag| !tag.is_empty())
    {
        let tag_id = transaction
            .query_row("SELECT id FROM tags WHERE name = ?1", [tag], |row| {
                row.get::<_, String>(0)
            })
            .optional()?
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        transaction.execute(
            "INSERT OR IGNORE INTO tags(id, name, created_at) VALUES (?1, ?2, ?3)",
            params![tag_id, tag, Utc::now().to_rfc3339()],
        )?;
        transaction.execute(
            "INSERT OR IGNORE INTO asset_tags(asset_id, tag_id) VALUES (?1, ?2)",
            params![asset_id, tag_id],
        )?;
    }
    Ok(())
}

fn sync_search(transaction: &Transaction<'_>, input: &AssetInput, asset_id: &str) -> AppResult<()> {
    transaction.execute("DELETE FROM asset_search WHERE asset_id = ?1", [asset_id])?;
    transaction.execute(
        "INSERT INTO asset_search(asset_id, title, platform, username_hint, environment, notes, tags) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![asset_id, input.title.trim(), input.platform.trim(), input.username_hint.trim(), input.environment.trim(), input.notes, input.tags.join(" ")],
    )?;
    Ok(())
}

pub fn save_asset(connection: &mut Connection, input: AssetInput) -> AppResult<AssetDetail> {
    save_asset_with_links(connection, input, None)
}

pub fn save_asset_with_links(
    connection: &mut Connection,
    mut input: AssetInput,
    links: Option<crate::models::AssetLinksInput>,
) -> AppResult<AssetDetail> {
    validate_asset(&input)?;
    let now = Utc::now().to_rfc3339();
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    input.id = Some(id.clone());
    let payload = serde_json::to_string(&input.fields)?;
    let tags = serde_json::to_string(&input.tags)?;
    let transaction = connection.transaction()?;
    let exists: bool = transaction.query_row(
        "SELECT EXISTS(SELECT 1 FROM assets WHERE id = ?1)",
        [&id],
        |row| row.get(0),
    )?;
    if exists {
        transaction.execute(
            "UPDATE assets SET kind=?2,title=?3,platform=?4,username_hint=?5,environment=?6,notes=?7,favorite=?8,expires_at=?9,parent_asset_id=?10,folder_id=?11,payload_json=?12,tags_json=?13,updated_at=?14 WHERE id=?1",
            params![id, input.kind.as_str(), input.title.trim(), input.platform.trim(), input.username_hint.trim(), input.environment.trim(), input.notes, i64::from(input.favorite), input.expires_at, input.parent_asset_id, input.folder_id, payload, tags, now],
        )?;
    } else {
        transaction.execute(
            "INSERT INTO assets(id,kind,title,platform,username_hint,environment,notes,favorite,expires_at,parent_asset_id,folder_id,payload_json,tags_json,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?14)",
            params![id, input.kind.as_str(), input.title.trim(), input.platform.trim(), input.username_hint.trim(), input.environment.trim(), input.notes, i64::from(input.favorite), input.expires_at, input.parent_asset_id, input.folder_id, payload, tags, now],
        )?;
    }
    sync_tags(&transaction, &id, &input.tags)?;
    sync_search(&transaction, &input, &id)?;
    if let Some(links) = links {
        let previous_relations = asset_relations_for_asset(&transaction, &id)?;
        let previous_bindings = bindings_for_asset(&transaction, &id)?;
        let mut retained = std::collections::HashSet::new();
        for mut relation in links.relations {
            if relation.source_asset_id.is_empty() {
                relation.source_asset_id = id.clone();
            }
            if relation.target_asset_id.is_empty() {
                relation.target_asset_id = id.clone();
            }
            if relation.source_asset_id != id && relation.target_asset_id != id {
                return Err(AppError::Validation("关联必须包含当前凭证".into()));
            }
            retained.insert(save_asset_relation(&transaction, relation)?.id);
        }
        for relation in previous_relations {
            if !retained.contains(&relation.id) {
                delete_asset_relation(&transaction, &relation.id)?;
            }
        }
        retained.clear();
        for mut binding in links.bindings {
            binding.asset_id = id.clone();
            retained.insert(save_binding(&transaction, binding)?.id);
        }
        for binding in previous_bindings {
            if !retained.contains(&binding.id) {
                delete_binding(&transaction, &binding.id)?;
            }
        }
    }
    transaction.commit()?;
    get_asset(connection, &id)
}

fn list_attachments(connection: &Connection, asset_id: &str) -> AppResult<Vec<AttachmentMeta>> {
    let mut statement = connection.prepare("SELECT id,asset_id,filename,format,fingerprint,sha256,size_bytes,has_passphrase,expires_at,created_at FROM attachments WHERE asset_id=?1 ORDER BY created_at DESC")?;
    let rows = statement.query_map([asset_id], |row| {
        Ok(AttachmentMeta {
            id: row.get(0)?,
            asset_id: row.get(1)?,
            filename: row.get(2)?,
            format: row.get(3)?,
            fingerprint: row.get(4)?,
            sha256: row.get(5)?,
            size_bytes: row.get::<_, i64>(6)? as u64,
            has_passphrase: row.get::<_, i64>(7)? != 0,
            expires_at: row.get(8)?,
            created_at: row.get(9)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn binding_row(row: &Row<'_>) -> rusqlite::Result<UsageBinding> {
    let kind: String = row.get(3)?;
    Ok(UsageBinding {
        id: row.get(0)?,
        asset_id: row.get(1)?,
        asset_title: row.get(2)?,
        consumer_kind: ConsumerKind::parse(&kind).ok_or(rusqlite::Error::InvalidQuery)?,
        consumer_id: row.get(4)?,
        consumer_name: row.get(5)?,
        purpose: row.get(6)?,
        config_key: row.get(7)?,
        environment: row.get(8)?,
        notes: row.get(9)?,
        last_verified_at: row.get(10)?,
    })
}

const BINDING_SELECT: &str = "SELECT ub.id,ub.asset_id,a.title,ub.consumer_kind,ub.consumer_id,CASE ub.consumer_kind WHEN 'project' THEN COALESCE((SELECT name FROM projects WHERE id=ub.consumer_id),'已删除产品') WHEN 'service' THEN COALESCE((SELECT name FROM services WHERE id=ub.consumer_id),'已删除产品组成') WHEN 'environment' THEN COALESCE((SELECT name FROM environments WHERE id=ub.consumer_id),'已删除环境') END,ub.purpose,ub.config_key,ub.environment,ub.notes,ub.last_verified_at FROM usage_bindings ub JOIN assets a ON a.id=ub.asset_id";

fn bindings_for_asset(connection: &Connection, asset_id: &str) -> AppResult<Vec<UsageBinding>> {
    let sql = format!("{BINDING_SELECT} WHERE ub.asset_id=?1 ORDER BY ub.updated_at DESC");
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([asset_id], binding_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn asset_relation_row(row: &Row<'_>) -> rusqlite::Result<AssetRelation> {
    let relation_type: String = row.get(5)?;
    Ok(AssetRelation {
        id: row.get(0)?,
        source_asset_id: row.get(1)?,
        source_title: row.get(2)?,
        target_asset_id: row.get(3)?,
        target_title: row.get(4)?,
        relation_type: AssetRelationType::parse(&relation_type)
            .ok_or(rusqlite::Error::InvalidQuery)?,
        notes: row.get(6)?,
    })
}

const ASSET_RELATION_SELECT: &str = "SELECT ar.id,ar.source_asset_id,source.title,ar.target_asset_id,target.title,ar.relation_type,ar.notes FROM asset_relations ar JOIN assets source ON source.id=ar.source_asset_id JOIN assets target ON target.id=ar.target_asset_id";

fn asset_relations_for_asset(
    connection: &Connection,
    asset_id: &str,
) -> AppResult<Vec<AssetRelation>> {
    let sql = format!(
        "{ASSET_RELATION_SELECT} WHERE ar.source_asset_id=?1 OR ar.target_asset_id=?1 ORDER BY ar.updated_at DESC"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([asset_id], asset_relation_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn active_asset_relations(connection: &Connection) -> AppResult<Vec<AssetRelation>> {
    let sql = format!(
        "{ASSET_RELATION_SELECT} WHERE source.deleted_at IS NULL AND target.deleted_at IS NULL ORDER BY ar.updated_at DESC"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([], asset_relation_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn asset_relation_label(relation_type: &AssetRelationType) -> &'static str {
    match relation_type {
        AssetRelationType::UsedToRegister => "用于注册",
        AssetRelationType::UsedToLogin => "用于登录",
        AssetRelationType::UsedToRecover => "用于找回",
        AssetRelationType::IssuesCredential => "签发凭证",
        AssetRelationType::SharedAccount => "共用账号",
        AssetRelationType::Other => "其他关联",
    }
}

fn child_assets(connection: &Connection, asset_id: &str) -> AppResult<Vec<AssetSummary>> {
    let sql = format!(
        "SELECT {SUMMARY_COLUMNS} FROM assets a WHERE a.parent_asset_id=?1 AND a.deleted_at IS NULL ORDER BY a.title"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([asset_id], row_to_summary)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_asset(connection: &Connection, asset_id: &str) -> AppResult<AssetDetail> {
    let input = get_asset_for_edit(connection, asset_id)?;
    let summary = get_summary(connection, asset_id)?;
    let fields = input
        .fields
        .iter()
        .map(|field| SecretFieldView {
            key: field.key.clone(),
            label: field.label.clone(),
            sensitive: field.sensitive,
            has_value: !field.value.is_empty(),
            value: if field.sensitive {
                None
            } else {
                Some(field.value.clone())
            },
        })
        .collect();
    Ok(AssetDetail {
        summary,
        notes: input.notes,
        fields,
        attachments: list_attachments(connection, asset_id)?,
        bindings: bindings_for_asset(connection, asset_id)?,
        asset_relations: asset_relations_for_asset(connection, asset_id)?,
        child_assets: child_assets(connection, asset_id)?,
    })
}

pub fn reveal_secret(
    connection: &Connection,
    asset_id: &str,
    field_key: &str,
) -> AppResult<String> {
    let input = get_asset_for_edit(connection, asset_id)?;
    input
        .fields
        .into_iter()
        .find(|field| field.key == field_key)
        .map(|field| field.value)
        .ok_or(AppError::NotFound)
}

pub fn trash_asset(connection: &Connection, asset_id: &str) -> AppResult<()> {
    let changed = connection.execute(
        "UPDATE assets SET deleted_at=?2,updated_at=?2 WHERE id=?1 AND deleted_at IS NULL",
        params![asset_id, Utc::now().to_rfc3339()],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

pub fn restore_asset(connection: &Connection, asset_id: &str) -> AppResult<()> {
    let changed = connection.execute(
        "UPDATE assets SET deleted_at=NULL,updated_at=?2 WHERE id=?1",
        params![asset_id, Utc::now().to_rfc3339()],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

pub fn purge_asset(connection: &mut Connection, asset_id: &str) -> AppResult<()> {
    let transaction = connection.transaction()?;
    transaction.execute("DELETE FROM asset_search WHERE asset_id=?1", [asset_id])?;
    let changed = transaction.execute(
        "DELETE FROM assets WHERE id=?1 AND deleted_at IS NOT NULL",
        [asset_id],
    )?;
    if changed == 0 {
        return Err(AppError::Validation("只能永久删除回收站中的项目".into()));
    }
    transaction.commit()?;
    Ok(())
}

pub fn add_attachment(
    connection: &Connection,
    asset_id: &str,
    source_path: &Path,
    passphrase: &str,
    expires_at: Option<String>,
) -> AppResult<AssetDetail> {
    get_summary(connection, asset_id)?;
    let metadata = fs::metadata(source_path)?;
    if metadata.len() > ATTACHMENT_LIMIT {
        return Err(AppError::AttachmentTooLarge);
    }
    let data = fs::read(source_path)?;
    let digest = Sha256::digest(&data);
    let filename = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::Validation("文件名无效".into()))?
        .to_string();
    let format = source_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("file")
        .to_ascii_lowercase();
    let sha256 = hex::encode(digest);
    let fingerprint = format!("SHA256:{}", STANDARD_NO_PAD.encode(digest));
    connection.execute(
        "INSERT INTO attachments(id,asset_id,filename,format,fingerprint,sha256,size_bytes,has_passphrase,expires_at,data,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![Uuid::new_v4().to_string(), asset_id, filename, format, fingerprint, sha256, metadata.len() as i64, i64::from(!passphrase.is_empty()), expires_at, data, Utc::now().to_rfc3339()],
    )?;
    get_asset(connection, asset_id)
}

pub fn export_attachment(
    connection: &Connection,
    attachment_id: &str,
    target_path: &Path,
) -> AppResult<()> {
    let mut data: Vec<u8> = connection
        .query_row(
            "SELECT data FROM attachments WHERE id=?1",
            [attachment_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or(AppError::NotFound)?;
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(target_path)?;
    output.write_all(&data)?;
    output.sync_all()?;
    data.zeroize();
    Ok(())
}

pub fn delete_attachment(connection: &Connection, attachment_id: &str) -> AppResult<()> {
    if connection.execute("DELETE FROM attachments WHERE id=?1", [attachment_id])? == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

pub fn save_binding(connection: &Connection, input: UsageBindingInput) -> AppResult<UsageBinding> {
    get_summary(connection, &input.asset_id)?;
    let consumer_exists: bool = match input.consumer_kind {
        ConsumerKind::Project => connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM projects WHERE id=?1 AND deleted_at IS NULL)",
            [&input.consumer_id],
            |row| row.get(0),
        )?,
        ConsumerKind::Service => connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM services WHERE id=?1)",
            [&input.consumer_id],
            |row| row.get(0),
        )?,
        ConsumerKind::Environment => connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM environments WHERE id=?1)",
            [&input.consumer_id],
            |row| row.get(0),
        )?,
    };
    if !consumer_exists {
        return Err(AppError::NotFound);
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO usage_bindings(id,asset_id,consumer_kind,consumer_id,purpose,config_key,environment,notes,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9) ON CONFLICT(asset_id,consumer_kind,consumer_id,purpose) DO UPDATE SET config_key=excluded.config_key,environment=excluded.environment,notes=excluded.notes,updated_at=excluded.updated_at",
        params![id, input.asset_id, input.consumer_kind.as_str(), input.consumer_id, input.purpose, input.config_key, input.environment, input.notes, now],
    )?;
    bindings_for_asset(connection, &input.asset_id)?
        .into_iter()
        .find(|binding| {
            binding.consumer_id == input.consumer_id
                && binding.purpose == input.purpose
                && binding.consumer_kind.as_str() == input.consumer_kind.as_str()
        })
        .ok_or(AppError::NotFound)
}

pub fn delete_binding(connection: &Connection, binding_id: &str) -> AppResult<()> {
    if connection.execute("DELETE FROM usage_bindings WHERE id=?1", [binding_id])? == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

pub fn save_asset_relation(
    connection: &Connection,
    input: AssetRelationInput,
) -> AppResult<AssetRelation> {
    if input.source_asset_id == input.target_asset_id {
        return Err(AppError::Validation("凭证不能关联自身".into()));
    }
    get_summary(connection, &input.source_asset_id)?;
    get_summary(connection, &input.target_asset_id)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO asset_relations(id,source_asset_id,target_asset_id,relation_type,notes,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6) ON CONFLICT(source_asset_id,target_asset_id,relation_type) DO UPDATE SET notes=excluded.notes,updated_at=excluded.updated_at",
        params![
            id,
            input.source_asset_id,
            input.target_asset_id,
            input.relation_type.as_str(),
            input.notes.trim(),
            now
        ],
    )?;
    asset_relations_for_asset(connection, &input.source_asset_id)?
        .into_iter()
        .find(|relation| {
            relation.source_asset_id == input.source_asset_id
                && relation.target_asset_id == input.target_asset_id
                && relation.relation_type == input.relation_type
        })
        .ok_or(AppError::NotFound)
}

pub fn delete_asset_relation(connection: &Connection, relation_id: &str) -> AppResult<()> {
    if connection.execute("DELETE FROM asset_relations WHERE id=?1", [relation_id])? == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

fn bindings_for_project(connection: &Connection, project_id: &str) -> AppResult<Vec<UsageBinding>> {
    let sql = format!(
        "{BINDING_SELECT} WHERE (ub.consumer_kind='project' AND ub.consumer_id=?1) OR (ub.consumer_kind='service' AND ub.consumer_id IN (SELECT id FROM services WHERE project_id=?1)) OR (ub.consumer_kind='environment' AND ub.consumer_id IN (SELECT id FROM environments WHERE project_id=?1)) ORDER BY ub.updated_at DESC"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([project_id], binding_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_projects(connection: &Connection) -> AppResult<Vec<Project>> {
    let mut statement = connection.prepare("SELECT id,name,description,repo_path,favorite,updated_at,logo FROM projects WHERE deleted_at IS NULL ORDER BY favorite DESC,updated_at DESC")?;
    let base = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)? != 0,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut projects = Vec::with_capacity(base.len());
    for (id, name, description, repo_path, favorite, updated_at, logo) in base {
        let mut service_statement = connection.prepare(
            "SELECT id,project_id,name,description FROM services WHERE project_id=?1 ORDER BY name",
        )?;
        let services = service_statement
            .query_map([&id], |row| {
                Ok(Service {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    name: row.get(2)?,
                    description: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let mut environment_statement = connection.prepare("SELECT id,project_id,service_id,name,kind FROM environments WHERE project_id=?1 ORDER BY name")?;
        let environments = environment_statement
            .query_map([&id], |row| {
                Ok(Environment {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    service_id: row.get(2)?,
                    name: row.get(3)?,
                    kind: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        projects.push(Project {
            logo,
            id: id.clone(),
            name,
            description,
            repo_path,
            favorite,
            updated_at,
            services,
            environments,
            bindings: bindings_for_project(connection, &id)?,
        });
    }
    Ok(projects)
}

fn validate_project_logo(logo: &str) -> AppResult<()> {
    if logo.is_empty() {
        return Ok(());
    }
    let invalid = || AppError::Validation("Logo 必须为不超过 1 MB 的 PNG 或 JPEG 图片".into());
    if logo.len() > 1_398_128 {
        return Err(invalid());
    }
    let (mime, encoded) = logo.split_once(";base64,").ok_or_else(invalid)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| invalid())?;
    if bytes.len() > 1024 * 1024 {
        return Err(invalid());
    }
    let valid = match mime {
        "data:image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "data:image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        _ => false,
    };
    if !valid {
        return Err(invalid());
    }
    Ok(())
}

pub fn save_project(connection: &Connection, input: ProjectInput) -> AppResult<Project> {
    validate_project_logo(&input.logo)?;
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("产品名称不能为空".into()));
    }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO projects(id,name,description,repo_path,favorite,created_at,updated_at,logo) VALUES (?1,?2,?3,?4,?5,?6,?6,?7) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,repo_path=excluded.repo_path,favorite=excluded.favorite,updated_at=excluded.updated_at,logo=excluded.logo",
        params![id, input.name.trim(), input.description, input.repo_path, i64::from(input.favorite), now, input.logo],
    )?;
    list_projects(connection)?
        .into_iter()
        .find(|project| project.id == id)
        .ok_or(AppError::NotFound)
}

pub fn save_service(connection: &Connection, input: ServiceInput) -> AppResult<Service> {
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("产品组成名称不能为空".into()));
    }
    let project_exists: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id=?1 AND deleted_at IS NULL)",
        [&input.project_id],
        |row| row.get(0),
    )?;
    if !project_exists {
        return Err(AppError::NotFound);
    }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO services(id,project_id,name,description,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,name=excluded.name,description=excluded.description,updated_at=excluded.updated_at",
        params![id, input.project_id, input.name.trim(), input.description, now],
    )?;
    Ok(Service {
        id,
        project_id: input.project_id,
        name: input.name.trim().into(),
        description: input.description,
    })
}

pub fn delete_service(connection: &Connection, service_id: &str) -> AppResult<()> {
    let transaction = connection.unchecked_transaction()?;
    transaction.execute(
        "DELETE FROM usage_bindings WHERE (consumer_kind='service' AND consumer_id=?1) OR (consumer_kind='environment' AND consumer_id IN (SELECT id FROM environments WHERE service_id=?1))",
        [service_id],
    )?;
    if transaction.execute("DELETE FROM services WHERE id=?1", [service_id])? == 0 {
        return Err(AppError::NotFound);
    }
    transaction.commit()?;
    Ok(())
}

pub fn save_environment(
    connection: &Connection,
    input: EnvironmentInput,
) -> AppResult<Environment> {
    if input.name.trim().is_empty() || input.kind.trim().is_empty() {
        return Err(AppError::Validation("环境名称和类型不能为空".into()));
    }
    let project_exists: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id=?1 AND deleted_at IS NULL)",
        [&input.project_id],
        |row| row.get(0),
    )?;
    if !project_exists {
        return Err(AppError::NotFound);
    }
    if let Some(service_id) = &input.service_id {
        let service_matches: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM services WHERE id=?1 AND project_id=?2)",
            params![service_id, input.project_id],
            |row| row.get(0),
        )?;
        if !service_matches {
            return Err(AppError::Validation("所选产品组成不属于当前产品".into()));
        }
    }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO environments(id,project_id,service_id,name,kind,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,service_id=excluded.service_id,name=excluded.name,kind=excluded.kind,updated_at=excluded.updated_at",
        params![id, input.project_id, input.service_id, input.name.trim(), input.kind.trim(), now],
    )?;
    Ok(Environment {
        id,
        project_id: input.project_id,
        service_id: input.service_id,
        name: input.name.trim().into(),
        kind: input.kind.trim().into(),
    })
}

pub fn delete_environment(connection: &Connection, environment_id: &str) -> AppResult<()> {
    let transaction = connection.unchecked_transaction()?;
    transaction.execute(
        "DELETE FROM usage_bindings WHERE consumer_kind='environment' AND consumer_id=?1",
        [environment_id],
    )?;
    if transaction.execute("DELETE FROM environments WHERE id=?1", [environment_id])? == 0 {
        return Err(AppError::NotFound);
    }
    transaction.commit()?;
    Ok(())
}

pub fn delete_project(connection: &Connection, project_id: &str) -> AppResult<()> {
    let transaction = connection.unchecked_transaction()?;
    transaction.execute("DELETE FROM usage_bindings WHERE (consumer_kind='project' AND consumer_id=?1) OR (consumer_kind='service' AND consumer_id IN (SELECT id FROM services WHERE project_id=?1)) OR (consumer_kind='environment' AND consumer_id IN (SELECT id FROM environments WHERE project_id=?1))", [project_id])?;
    if transaction.execute("DELETE FROM projects WHERE id=?1", [project_id])? == 0 {
        return Err(AppError::NotFound);
    }
    transaction.commit()?;
    Ok(())
}

pub fn graph_data(connection: &Connection) -> AppResult<GraphData> {
    let assets = list_assets(connection, &AssetFilter::default())?;
    let projects = list_projects(connection)?;
    let mut graph = GraphData::default();
    let mut platforms = std::collections::BTreeSet::new();
    for asset in &assets {
        if !asset.platform.trim().is_empty() {
            platforms.insert(asset.platform.trim().to_string());
        }
    }
    for platform in platforms {
        let id = format!("platform:{}", platform.to_lowercase());
        graph.nodes.push(GraphNode {
            id,
            node_type: "platform".into(),
            label: platform,
            subtitle: "平台账号".into(),
            status: None,
        });
    }
    for asset in &assets {
        graph.nodes.push(GraphNode {
            id: asset.id.clone(),
            node_type: "asset".into(),
            label: asset.title.clone(),
            subtitle: format!("{} · {}", asset.kind.as_str(), asset.environment),
            status: asset.expires_at.clone(),
        });
        if !asset.platform.trim().is_empty() {
            graph.edges.push(GraphEdge {
                id: format!("platform-{}", asset.id),
                source: format!("platform:{}", asset.platform.trim().to_lowercase()),
                target: asset.id.clone(),
                label: "提供".into(),
            });
        }
        if let Some(parent) = &asset.parent_asset_id {
            graph.edges.push(GraphEdge {
                id: format!("parent-{}", asset.id),
                source: parent.clone(),
                target: asset.id.clone(),
                label: "关联".into(),
            });
        }
    }
    for relation in active_asset_relations(connection)? {
        graph.edges.push(GraphEdge {
            id: format!("asset-relation-{}", relation.id),
            source: relation.source_asset_id,
            target: relation.target_asset_id,
            label: asset_relation_label(&relation.relation_type).into(),
        });
    }
    for project in &projects {
        graph.nodes.push(GraphNode {
            id: project.id.clone(),
            node_type: "project".into(),
            label: project.name.clone(),
            subtitle: "产品".into(),
            status: None,
        });
        for service in &project.services {
            graph.nodes.push(GraphNode {
                id: service.id.clone(),
                node_type: "service".into(),
                label: service.name.clone(),
                subtitle: project.name.clone(),
                status: None,
            });
            graph.edges.push(GraphEdge {
                id: format!("project-service-{}", service.id),
                source: project.id.clone(),
                target: service.id.clone(),
                label: "包含".into(),
            });
        }
        for environment in &project.environments {
            graph.nodes.push(GraphNode {
                id: environment.id.clone(),
                node_type: "environment".into(),
                label: environment.name.clone(),
                subtitle: environment.kind.clone(),
                status: None,
            });
            graph.edges.push(GraphEdge {
                id: format!("environment-{}", environment.id),
                source: environment
                    .service_id
                    .clone()
                    .unwrap_or_else(|| project.id.clone()),
                target: environment.id.clone(),
                label: "部署".into(),
            });
        }
        for binding in &project.bindings {
            graph.edges.push(GraphEdge {
                id: format!("binding-{}", binding.id),
                source: binding.asset_id.clone(),
                target: binding.consumer_id.clone(),
                label: if binding.purpose.is_empty() {
                    "使用".into()
                } else {
                    binding.purpose.clone()
                },
            });
        }
    }
    Ok(graph)
}

pub fn checkpoint(connection: &Connection) -> AppResult<()> {
    connection.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    Ok(())
}

#[cfg(test)]
mod migration_tests {
    use super::*;

    #[test]
    fn product_logo_migration_and_edit_round_trip() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("vault.db");
        let key = [4_u8; 32];
        let connection = open_encrypted(&path, &key).unwrap();
        connection.execute_batch(MIGRATION_1).unwrap();
        connection.execute_batch(MIGRATION_2).unwrap();
        connection.execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (2, ''); INSERT INTO projects(id,name,description,repo_path,favorite,created_at,updated_at) VALUES ('p','Old','Before','local',1,'created','updated');").unwrap();
        migrate(&connection).unwrap();
        migrate(&connection).unwrap();
        assert_eq!(list_projects(&connection).unwrap()[0].logo, "");
        let service = save_service(
            &connection,
            ServiceInput {
                id: None,
                project_id: "p".into(),
                name: "Web".into(),
                description: "".into(),
            },
        )
        .unwrap();
        let logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=";
        let mut input = ProjectInput {
            id: Some("p".into()),
            name: "New".into(),
            description: "After".into(),
            repo_path: "local".into(),
            favorite: true,
            logo: logo.into(),
        };
        let edited = save_project(&connection, input.clone()).unwrap();
        assert_eq!(edited.services[0].id, service.id);
        drop(connection);
        let reopened = open_encrypted(&path, &key).unwrap();
        let persisted = list_projects(&reopened).unwrap().remove(0);
        assert_eq!(persisted.logo, logo);
        assert_eq!(persisted.name, "New");
        assert_eq!(persisted.description, "After");
        assert!(persisted.favorite);
        assert_eq!(persisted.repo_path, "local");
        input.logo = "https://example.invalid/logo.png".into();
        assert!(save_project(&reopened, input.clone()).is_err());
        assert_eq!(list_projects(&reopened).unwrap()[0].logo, logo);
        input.logo.clear();
        assert_eq!(save_project(&reopened, input).unwrap().logo, "");
    }

    #[test]
    fn product_logo_rejects_unsupported_invalid_and_oversized_data() {
        assert!(validate_project_logo("").is_ok());
        for logo in [
            "https://example.invalid/a.png",
            "data:image/svg+xml;base64,PHN2Zz4=",
            "data:image/png;base64,SGVsbG8=",
            "data:image/jpeg;base64,%%%",
        ] {
            assert!(validate_project_logo(logo).is_err());
        }
        let mut bytes = vec![0xff, 0xd8, 0xff];
        bytes.resize(1024 * 1024 + 1, 0);
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        assert!(validate_project_logo(&format!("data:image/jpeg;base64,{encoded}")).is_err());
    }

    #[test]
    fn encrypted_database_migrates_and_reopens() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("vault.db");
        let key = [7_u8; 32];
        let connection = initialize_database(&path, &key, "test-vault").unwrap();
        let version: i64 = connection
            .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(version, 3);
        drop(connection);
        assert!(open_encrypted(&path, &[8_u8; 32]).is_err());
        let reopened = open_encrypted(&path, &key).unwrap();
        let vault_id: String = reopened
            .query_row(
                "SELECT value FROM vault_meta WHERE key='vault_id'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(vault_id, "test-vault");
    }

    #[test]
    fn version_one_database_upgrades_to_typed_asset_relations() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("vault.db");
        let key = [9_u8; 32];
        let connection = open_encrypted(&path, &key).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);",
            )
            .unwrap();
        connection.execute_batch(MIGRATION_1).unwrap();
        connection
            .execute(
                "INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?1)",
                [Utc::now().to_rfc3339()],
            )
            .unwrap();
        drop(connection);

        let upgraded = initialize_database(&path, &key, "existing-vault").unwrap();
        let version: i64 = upgraded
            .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        let relation_table: String = upgraded
            .query_row(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='asset_relations'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, 3);
        assert_eq!(relation_table, "asset_relations");
    }

    #[test]
    fn asset_round_trip_masks_sensitive_values() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("vault.db");
        let mut connection = initialize_database(&path, &[3_u8; 32], "test-vault").unwrap();
        let saved = save_asset(
            &mut connection,
            AssetInput {
                id: None,
                kind: AssetKind::WebAccount,
                title: "Example".into(),
                platform: "example.com".into(),
                username_hint: "user".into(),
                environment: "".into(),
                notes: "".into(),
                favorite: false,
                expires_at: None,
                parent_asset_id: None,
                folder_id: None,
                tags: vec!["personal".into()],
                fields: vec![
                    crate::models::SecretFieldInput {
                        key: "username".into(),
                        label: "用户名".into(),
                        value: "visible-user".into(),
                        sensitive: false,
                    },
                    crate::models::SecretFieldInput {
                        key: "password".into(),
                        label: "密码".into(),
                        value: "test-secret".into(),
                        sensitive: true,
                    },
                ],
            },
        )
        .unwrap();
        assert_eq!(saved.fields[0].value.as_deref(), Some("visible-user"));
        assert_eq!(saved.fields[1].value, None);
        assert_eq!(
            reveal_secret(&connection, &saved.summary.id, "password").unwrap(),
            "test-secret"
        );
        let results = list_assets(
            &connection,
            &AssetFilter {
                query: Some("Example".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].core_fields.len(), 2);
        assert_eq!(
            results[0].core_fields[0],
            AssetListField {
                key: "username".into(),
                label: "用户名".into(),
                value: "visible-user".into(),
                sensitive: false,
            }
        );
        assert_eq!(
            results[0].core_fields[1],
            AssetListField {
                key: "password".into(),
                label: "密码".into(),
                value: "••••••••".into(),
                sensitive: true,
            }
        );
        assert_eq!(
            masked_field_preview("api_key", "sk-test-1234567890"),
            "sk-t••••7890"
        );
        assert!(
            results[0]
                .core_fields
                .iter()
                .all(|field| field.value != "test-secret")
        );
    }

    #[test]
    fn search_matches_substrings_and_escapes_like_wildcards() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("vault.db");
        let mut connection = initialize_database(&path, &[6_u8; 32], "search-vault").unwrap();
        let wechat = save_asset(
            &mut connection,
            AssetInput {
                id: None,
                kind: AssetKind::WebAccount,
                title: "微信开放平台".into(),
                platform: "腾讯".into(),
                username_hint: "life@deeplorex.com".into(),
                environment: String::new(),
                notes: String::new(),
                favorite: false,
                expires_at: None,
                parent_asset_id: None,
                folder_id: None,
                tags: vec!["微信".into()],
                fields: vec![],
            },
        )
        .unwrap();
        save_asset(
            &mut connection,
            AssetInput {
                id: None,
                kind: AssetKind::WebAccount,
                title: "进度_50%完成".into(),
                platform: String::new(),
                username_hint: String::new(),
                environment: String::new(),
                notes: String::new(),
                favorite: false,
                expires_at: None,
                parent_asset_id: None,
                folder_id: None,
                tags: vec![],
                fields: vec![],
            },
        )
        .unwrap();
        let search = |query: &str| {
            list_assets(
                &connection,
                &AssetFilter {
                    query: Some(query.into()),
                    ..Default::default()
                },
            )
            .unwrap()
            .into_iter()
            .map(|asset| asset.id)
            .collect::<Vec<_>>()
        };
        let wechat_id = wechat.summary.id.clone();

        assert_eq!(search("开放"), vec![wechat_id.clone()]);
        assert_eq!(search("deeplorex"), vec![wechat_id.clone()]);
        assert_eq!(search("微信 开放"), vec![wechat_id.clone()]);
        assert_eq!(search("腾 讯"), vec![wechat_id.clone()]);
        assert!(search("不存在的词").is_empty());
        let wildcard_hits = search("0%完");
        assert_eq!(wildcard_hits.len(), 1);
        assert_eq!(wildcard_hits[0], search("_")[0]);
        assert_eq!(wildcard_hits[0], search("%")[0]);
        assert_ne!(wildcard_hits[0], wechat_id);
    }

    #[test]
    fn editor_links_save_atomically_and_preserve_unchanged_metadata() {
        use crate::models::AssetLinksInput;
        let directory = tempfile::tempdir().unwrap();
        let mut connection =
            initialize_database(&directory.path().join("vault.db"), &[7_u8; 32], "links").unwrap();
        let input: AssetInput = serde_json::from_value(serde_json::json!({
            "kind": "web_account", "title": "Email"
        }))
        .unwrap();
        let email = save_asset(&mut connection, input.clone()).unwrap();
        let project = save_project(
            &connection,
            ProjectInput {
                logo: String::new(),
                id: None,
                name: "AAA".into(),
                description: "".into(),
                repo_path: "".into(),
                favorite: false,
            },
        )
        .unwrap();
        let links = AssetLinksInput {
            relations: vec![AssetRelationInput {
                source_asset_id: email.summary.id.clone(),
                target_asset_id: "".into(),
                relation_type: AssetRelationType::UsedToRegister,
                notes: "".into(),
            }],
            bindings: vec![UsageBindingInput {
                asset_id: "".into(),
                consumer_kind: ConsumerKind::Project,
                consumer_id: project.id,
                purpose: "registration".into(),
                config_key: "".into(),
                environment: "".into(),
                notes: "".into(),
            }],
        };
        let mut invalid = links.clone();
        invalid.bindings[0].consumer_id = "missing".into();
        assert!(save_asset_with_links(&mut connection, input.clone(), Some(invalid)).is_err());
        assert_eq!(
            list_assets(&connection, &AssetFilter::default())
                .unwrap()
                .len(),
            1
        );
        assert!(
            get_asset(&connection, &email.summary.id)
                .unwrap()
                .asset_relations
                .is_empty()
        );
        let saved = save_asset_with_links(&mut connection, input, Some(links.clone())).unwrap();
        assert_eq!(saved.asset_relations.len(), 1);
        assert_eq!(saved.bindings.len(), 1);
        connection
            .execute(
                "UPDATE usage_bindings SET last_verified_at='verified' WHERE id=?1",
                [&saved.bindings[0].id],
            )
            .unwrap();
        let mut edit = get_asset_for_edit(&connection, &saved.summary.id).unwrap();
        let retained =
            save_asset_with_links(&mut connection, edit.clone(), Some(links.clone())).unwrap();
        assert_eq!(retained.bindings[0].id, saved.bindings[0].id);
        assert_eq!(
            retained.bindings[0].last_verified_at.as_deref(),
            Some("verified")
        );
        assert_eq!(retained.asset_relations[0].id, saved.asset_relations[0].id);
        edit.title = "Must roll back".into();
        let mut invalid = links;
        invalid.bindings[0].consumer_id = "missing".into();
        assert!(save_asset_with_links(&mut connection, edit.clone(), Some(invalid)).is_err());
        assert_eq!(
            get_asset(&connection, &saved.summary.id)
                .unwrap()
                .summary
                .title,
            saved.summary.title
        );
        let cleared = save_asset_with_links(
            &mut connection,
            edit,
            Some(AssetLinksInput {
                relations: vec![],
                bindings: vec![],
            }),
        )
        .unwrap();
        assert!(cleared.bindings.is_empty());
        assert!(cleared.asset_relations.is_empty());
    }

    #[test]
    fn credential_relations_round_trip_and_appear_in_the_graph() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("vault.db");
        let mut connection = initialize_database(&path, &[5_u8; 32], "relation-vault").unwrap();
        let email = save_asset(
            &mut connection,
            AssetInput {
                id: None,
                kind: AssetKind::WebAccount,
                title: "注册邮箱".into(),
                platform: "QQ 邮箱".into(),
                username_hint: "owner@example.com".into(),
                environment: String::new(),
                notes: String::new(),
                favorite: false,
                expires_at: None,
                parent_asset_id: None,
                folder_id: None,
                tags: vec![],
                fields: vec![],
            },
        )
        .unwrap();
        let mini_program = save_asset(
            &mut connection,
            AssetInput {
                id: None,
                kind: AssetKind::WebAccount,
                title: "AAA 小程序账号".into(),
                platform: "微信公众平台".into(),
                username_hint: "owner@example.com".into(),
                environment: String::new(),
                notes: String::new(),
                favorite: false,
                expires_at: None,
                parent_asset_id: None,
                folder_id: None,
                tags: vec![],
                fields: vec![],
            },
        )
        .unwrap();

        let relation = save_asset_relation(
            &connection,
            AssetRelationInput {
                source_asset_id: email.summary.id.clone(),
                target_asset_id: mini_program.summary.id.clone(),
                relation_type: AssetRelationType::UsedToRecover,
                notes: "找回小程序账号".into(),
            },
        )
        .unwrap();
        let detail = get_asset(&connection, &mini_program.summary.id).unwrap();
        assert_eq!(detail.asset_relations.len(), 1);
        assert_eq!(detail.asset_relations[0].source_title, "注册邮箱");
        assert_eq!(detail.asset_relations[0].notes, "找回小程序账号");
        assert!(graph_data(&connection).unwrap().edges.iter().any(|edge| {
            edge.source == email.summary.id
                && edge.target == mini_program.summary.id
                && edge.label == "用于找回"
        }));

        delete_asset_relation(&connection, &relation.id).unwrap();
        assert!(
            get_asset(&connection, &mini_program.summary.id)
                .unwrap()
                .asset_relations
                .is_empty()
        );
    }

    #[test]
    fn folders_and_product_dependencies_round_trip() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("vault.db");
        let mut connection = initialize_database(&path, &[4_u8; 32], "structure-vault").unwrap();
        let root = save_folder(
            &connection,
            FolderInput {
                id: None,
                parent_id: None,
                name: "工作".into(),
            },
        )
        .unwrap();
        let child = save_folder(
            &connection,
            FolderInput {
                id: None,
                parent_id: Some(root.id.clone()),
                name: "AI 产品".into(),
            },
        )
        .unwrap();
        let asset = save_asset(
            &mut connection,
            AssetInput {
                id: None,
                kind: AssetKind::ApiCredential,
                title: "DeepSeek API".into(),
                platform: "DeepSeek".into(),
                username_hint: "".into(),
                environment: "prod".into(),
                notes: "".into(),
                favorite: false,
                expires_at: None,
                parent_asset_id: None,
                folder_id: Some(child.id.clone()),
                tags: vec!["AI".into()],
                fields: vec![crate::models::SecretFieldInput {
                    key: "api_key".into(),
                    label: "API Key".into(),
                    value: "secret".into(),
                    sensitive: true,
                }],
            },
        )
        .unwrap();
        let filtered = list_assets(
            &connection,
            &AssetFilter {
                folder_id: Some(child.id.clone()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(filtered[0].folder_id.as_deref(), Some(child.id.as_str()));

        let project = save_project(
            &connection,
            ProjectInput {
                logo: String::new(),
                id: None,
                name: "智能客服".into(),
                description: "".into(),
                repo_path: "".into(),
                favorite: false,
            },
        )
        .unwrap();
        let service = save_service(
            &connection,
            ServiceInput {
                id: None,
                project_id: project.id.clone(),
                name: "问答服务".into(),
                description: "".into(),
            },
        )
        .unwrap();
        let environment = save_environment(
            &connection,
            EnvironmentInput {
                id: None,
                project_id: project.id.clone(),
                service_id: Some(service.id.clone()),
                name: "生产".into(),
                kind: "prod".into(),
            },
        )
        .unwrap();
        save_binding(
            &connection,
            UsageBindingInput {
                asset_id: asset.summary.id.clone(),
                consumer_kind: ConsumerKind::Environment,
                consumer_id: environment.id.clone(),
                purpose: "模型推理".into(),
                config_key: "DEEPSEEK_API_KEY".into(),
                environment: "prod".into(),
                notes: "".into(),
            },
        )
        .unwrap();
        let projects = list_projects(&connection).unwrap();
        assert_eq!(projects[0].bindings[0].asset_title, "DeepSeek API");
        let graph = graph_data(&connection).unwrap();
        assert!(graph.nodes.iter().any(|node| node.id == environment.id));
        assert!(
            graph
                .edges
                .iter()
                .any(|edge| edge.source == asset.summary.id && edge.target == environment.id)
        );

        delete_folder(&connection, &child.id).unwrap();
        assert_eq!(
            get_summary(&connection, &asset.summary.id)
                .unwrap()
                .folder_id,
            None
        );
    }
}
