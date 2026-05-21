use anyhow::{Result, anyhow};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use uuid::Uuid;

const CONNECTOR_SCHEMA_VERSION: u32 = 1;

fn timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("unix:{}", now.as_secs())
}

pub fn connectors_root(data_dir: &Path) -> PathBuf {
    data_dir.join("connectors")
}

pub fn connector_modules_dir(data_dir: &Path) -> PathBuf {
    connectors_root(data_dir).join("modules")
}

pub fn connector_state_dir(data_dir: &Path) -> PathBuf {
    connectors_root(data_dir).join("state")
}

pub fn connector_cache_dir(data_dir: &Path) -> PathBuf {
    connectors_root(data_dir).join("cache")
}

fn connector_module_dir(data_dir: &Path, provider_id: &str) -> PathBuf {
    connector_modules_dir(data_dir).join(provider_id)
}

pub fn chat_index_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("chat-index")
}

pub fn chat_database_path(data_dir: &Path) -> PathBuf {
    chat_index_dir(data_dir).join("chat.sqlite")
}

pub fn ensure_connector_workspace(data_dir: &Path) -> Result<()> {
    fs::create_dir_all(connector_modules_dir(data_dir))?;
    fs::create_dir_all(connector_state_dir(data_dir))?;
    fs::create_dir_all(connector_cache_dir(data_dir))?;
    fs::create_dir_all(chat_index_dir(data_dir))?;
    let _ = open_chat_database(&chat_database_path(data_dir))?;
    Ok(())
}

pub fn built_in_connector_provider_ids() -> Vec<String> {
    built_in_connector_manifests()
        .into_iter()
        .filter_map(|item| {
            item.get("providerId")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect()
}

pub fn list_connectors(data_dir: &Path) -> Result<Value> {
    ensure_connector_workspace(data_dir)?;
    let manifests = merged_manifests(data_dir)?;
    let mut connectors = Vec::new();
    for manifest in manifests {
        let provider_id = provider_id(&manifest)?;
        let state = load_connector_state(data_dir, &provider_id)?
            .unwrap_or_else(|| default_connector_state(&manifest));
        connectors.push(public_connector_record(&manifest, &state, data_dir)?);
    }
    connectors.sort_by(|left, right| {
        let left_id = left
            .get("providerId")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let right_id = right
            .get("providerId")
            .and_then(Value::as_str)
            .unwrap_or_default();
        left_id.cmp(right_id)
    });
    Ok(json!({
        "ok": true,
        "schemaVersion": CONNECTOR_SCHEMA_VERSION,
        "connectorRoot": connectors_root(data_dir).to_string_lossy().to_string(),
        "chatDatabasePath": chat_database_path(data_dir).to_string_lossy().to_string(),
        "connectors": connectors
    }))
}

pub fn install_connector(data_dir: &Path, params: Value) -> Result<Value> {
    ensure_connector_workspace(data_dir)?;
    let manifest = manifest_from_install_params(data_dir, &params)?;
    validate_connector_manifest(&manifest)?;
    let provider_id = provider_id(&manifest)?;
    if load_connector_state(data_dir, &provider_id)?
        .and_then(|state| state.get("installed").and_then(Value::as_bool))
        .unwrap_or(false)
    {
        return Err(anyhow!("data connector already installed: {}", provider_id));
    }
    if let Some(source_dir) = connector_package_source_dir(&params)? {
        persist_connector_package(data_dir, &manifest, &source_dir)?;
    } else {
        persist_connector_manifest(data_dir, &manifest)?;
    }
    let mut state = default_connector_state(&manifest);
    state["installed"] = json!(true);
    state["enabled"] = json!(false);
    state["status"] = json!("installed");
    state["lifecycle"] = json!({
        "installedAt": timestamp(),
        "packageKind": if connector_package_source_dir(&params)?.is_some() { "directory" } else { "manifest" },
        "runtimeKind": connector_runtime_kind(&manifest)
    });
    state["updatedAt"] = json!(timestamp());
    save_connector_state(data_dir, &provider_id, &state)?;
    fs::create_dir_all(connector_cache_dir(data_dir).join(&provider_id))?;
    Ok(json!({
        "ok": true,
        "connector": public_connector_record(&manifest, &state, data_dir)?
    }))
}

pub fn enable_connector(data_dir: &Path, params: Value) -> Result<Value> {
    update_connector_state(data_dir, params, |state| {
        state["installed"] = json!(true);
        state["enabled"] = json!(true);
        state["status"] = json!("enabled");
        Ok(())
    })
}

pub fn disable_connector(data_dir: &Path, params: Value) -> Result<Value> {
    update_connector_state(data_dir, params, |state| {
        state["enabled"] = json!(false);
        state["status"] = json!("disabled");
        Ok(())
    })
}

pub fn uninstall_connector(data_dir: &Path, params: Value) -> Result<Value> {
    let provider_id = provider_id_from_params(&params)?;
    let manifest = resolve_manifest(data_dir, &provider_id)?;
    let mut state = load_connector_state(data_dir, &provider_id)?
        .unwrap_or_else(|| default_connector_state(&manifest));
    let mut connector_result = json!({});
    if connector_runtime_kind(&manifest) == "process" && connector_supports(&manifest, "uninstall")
    {
        connector_result =
            invoke_connector_process(data_dir, &manifest, "uninstall", params.clone())?;
    }
    state["installed"] = json!(false);
    state["enabled"] = json!(false);
    state["status"] = json!("uninstalled");
    state["updatedAt"] = json!(timestamp());
    save_connector_state(data_dir, &provider_id, &state)?;
    let connector = public_connector_record(&manifest, &state, data_dir)?;

    let remove_cache = params
        .get("removeCache")
        .or_else(|| {
            manifest
                .get("uninstallPolicy")
                .and_then(|item| item.get("removeLocalMirror"))
        })
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if remove_cache {
        let _ = fs::remove_dir_all(connector_cache_dir(data_dir).join(&provider_id));
    }
    let is_builtin = built_in_connector_provider_ids()
        .iter()
        .any(|item| item == &provider_id);
    let remove_module = params
        .get("removeModule")
        .or_else(|| {
            manifest
                .get("uninstallPolicy")
                .and_then(|item| item.get("removeModuleOnUninstall"))
        })
        .and_then(Value::as_bool)
        .unwrap_or(!is_builtin && connector_runtime_kind(&manifest) == "process");
    if remove_module && !is_builtin {
        let _ = fs::remove_dir_all(connector_module_dir(data_dir, &provider_id));
    }
    Ok(json!({
        "ok": true,
        "providerId": provider_id,
        "removedCache": remove_cache,
        "removedModule": remove_module && !is_builtin,
        "runtime": connector_runtime_public(&manifest),
        "connectorResult": connector_result,
        "connector": connector
    }))
}

pub fn start_connector_auth(data_dir: &Path, params: Value) -> Result<Value> {
    let provider_id = provider_id_from_params(&params)?;
    let manifest = resolve_manifest(data_dir, &provider_id)?;
    let mut state = installed_state(data_dir, &manifest)?;
    if connector_runtime_kind(&manifest) == "process" && connector_supports(&manifest, "auth.start")
    {
        let result = invoke_connector_process(data_dir, &manifest, "auth.start", params)?;
        state["auth"] = result.get("auth").cloned().unwrap_or_else(|| {
            json!({
                "status": result.get("status").and_then(Value::as_str).unwrap_or("unknown"),
                "updatedAt": timestamp()
            })
        });
        state["updatedAt"] = json!(timestamp());
        save_connector_state(data_dir, &provider_id, &state)?;
        return Ok(json!({
            "ok": true,
            "providerId": provider_id,
            "auth": state.get("auth").cloned().unwrap_or_else(|| json!({})),
            "runtime": connector_runtime_public(&manifest),
            "connectorResult": result,
            "connector": public_connector_record(&manifest, &state, data_dir)?
        }));
    }
    let oauth = manifest.get("oauth").cloned().unwrap_or_else(|| json!({}));
    if oauth.get("type").and_then(Value::as_str).unwrap_or("none") == "none" {
        state["auth"] = json!({
            "status": "not_required",
            "credentialStore": "none",
            "updatedAt": timestamp()
        });
    } else if params
        .get("mockToken")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .is_empty()
        && params
            .get("complete")
            .and_then(Value::as_bool)
            .unwrap_or(false)
            != true
    {
        let auth_url = oauth
            .get("authorizationUrl")
            .and_then(Value::as_str)
            .unwrap_or("about:blank");
        state["auth"] = json!({
            "status": "authorization_required",
            "credentialStore": "system-keychain",
            "authorizationUrl": auth_url,
            "sessionId": format!("auth-{}", Uuid::new_v4()),
            "scopes": oauth.get("scopes").cloned().unwrap_or_else(|| json!([])),
            "updatedAt": timestamp()
        });
    } else {
        state["auth"] = json!({
            "status": "connected",
            "credentialStore": "system-keychain",
            "accountHint": params.get("accountHint").and_then(Value::as_str).unwrap_or("mock-account"),
            "scopes": oauth.get("scopes").cloned().unwrap_or_else(|| json!([])),
            "connectedAt": timestamp(),
            "updatedAt": timestamp()
        });
    }
    state["updatedAt"] = json!(timestamp());
    save_connector_state(data_dir, &provider_id, &state)?;
    Ok(json!({
        "ok": true,
        "providerId": provider_id,
        "auth": state.get("auth").cloned().unwrap_or_else(|| json!({})),
        "connector": public_connector_record(&manifest, &state, data_dir)?
    }))
}

pub fn connector_auth_status(data_dir: &Path, params: Value) -> Result<Value> {
    let provider_id = provider_id_from_params(&params)?;
    let manifest = resolve_manifest(data_dir, &provider_id)?;
    let state = load_connector_state(data_dir, &provider_id)?
        .unwrap_or_else(|| default_connector_state(&manifest));
    if connector_runtime_kind(&manifest) == "process"
        && connector_supports(&manifest, "auth.status")
    {
        let result = invoke_connector_process(data_dir, &manifest, "auth.status", params)?;
        return Ok(json!({
            "ok": true,
            "providerId": provider_id,
            "auth": result.get("auth").cloned().unwrap_or_else(|| state.get("auth").cloned().unwrap_or_else(|| json!({}))),
            "runtime": connector_runtime_public(&manifest),
            "connectorResult": result
        }));
    }
    Ok(json!({
        "ok": true,
        "providerId": provider_id,
        "auth": state.get("auth").cloned().unwrap_or_else(|| json!({}))
    }))
}

pub fn revoke_connector_auth(data_dir: &Path, params: Value) -> Result<Value> {
    let provider_id = provider_id_from_params(&params)?;
    let manifest = resolve_manifest(data_dir, &provider_id)?;
    let mut state = load_connector_state(data_dir, &provider_id)?
        .unwrap_or_else(|| default_connector_state(&manifest));
    let mut connector_result = json!({});
    if connector_runtime_kind(&manifest) == "process"
        && connector_supports(&manifest, "auth.revoke")
    {
        connector_result = invoke_connector_process(data_dir, &manifest, "auth.revoke", params)?;
    }
    state["auth"] = json!({
        "status": "revoked",
        "credentialStore": "system-keychain",
        "revokedAt": timestamp(),
        "updatedAt": timestamp()
    });
    state["updatedAt"] = json!(timestamp());
    save_connector_state(data_dir, &provider_id, &state)?;
    Ok(json!({
        "ok": true,
        "providerId": provider_id,
        "auth": state.get("auth").cloned().unwrap_or_else(|| json!({})),
        "runtime": connector_runtime_public(&manifest),
        "connectorResult": connector_result
    }))
}

pub fn sync_connector(data_dir: &Path, params: Value) -> Result<Value> {
    let provider_id = provider_id_from_params(&params)?;
    let manifest = resolve_manifest(data_dir, &provider_id)?;
    let mut state = installed_state(data_dir, &manifest)?;
    if state
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        != true
    {
        return Err(anyhow!("data connector is disabled: {}", provider_id));
    }

    let source_type = manifest
        .get("sourceType")
        .and_then(Value::as_str)
        .unwrap_or("source")
        .to_string();
    let now = timestamp();
    let sync_batch_id = params
        .get("syncBatchId")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("sync-{}", Uuid::new_v4()));
    let mut runtime_result = json!({});
    let sync_payload = if connector_runtime_kind(&manifest) == "process"
        && connector_supports(&manifest, "sync")
    {
        let mut process_params = params.clone();
        process_params["syncBatchId"] = json!(sync_batch_id);
        let result = invoke_connector_process(data_dir, &manifest, "sync", process_params)?;
        runtime_result = result.clone();
        result
    } else {
        params.clone()
    };
    let synced_count = if source_type == "chat" {
        let messages = chat_messages_from_params(&sync_payload)?;
        ingest_chat_messages(
            data_dir,
            &provider_id,
            &source_type,
            &sync_batch_id,
            &messages,
        )?
    } else {
        let hits = source_items_from_params(&sync_payload)?;
        append_source_mirror(data_dir, &provider_id, &source_type, &sync_batch_id, &hits)?
    };

    state["lastSync"] = json!({
        "status": "completed",
        "syncBatchId": sync_batch_id,
        "itemCount": synced_count,
        "completedAt": now
    });
    state["status"] = json!("synced");
    state["updatedAt"] = json!(timestamp());
    save_connector_state(data_dir, &provider_id, &state)?;
    Ok(json!({
        "ok": true,
        "providerId": provider_id,
        "sourceType": source_type,
        "syncBatchId": sync_batch_id,
        "itemCount": synced_count,
        "runtime": connector_runtime_public(&manifest),
        "connectorResult": runtime_result,
        "connector": public_connector_record(&manifest, &state, data_dir)?
    }))
}

pub fn connector_health(data_dir: &Path, params: Value) -> Result<Value> {
    ensure_connector_workspace(data_dir)?;
    let provider_filter = params
        .get("providerId")
        .or_else(|| params.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let manifests = merged_manifests(data_dir)?;
    let mut items = Vec::new();
    for manifest in manifests {
        let provider_id = provider_id(&manifest)?;
        if provider_filter
            .as_ref()
            .is_some_and(|filter| filter != &provider_id)
        {
            continue;
        }
        let state = load_connector_state(data_dir, &provider_id)?
            .unwrap_or_else(|| default_connector_state(&manifest));
        let runtime_health = if state
            .get("installed")
            .and_then(Value::as_bool)
            .unwrap_or(false)
            && state
                .get("enabled")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            && connector_runtime_kind(&manifest) == "process"
            && connector_supports(&manifest, "health")
        {
            invoke_connector_process(
                data_dir,
                &manifest,
                "health",
                json!({ "providerId": provider_id }),
            )
            .unwrap_or_else(|error| json!({ "ok": false, "error": error.to_string() }))
        } else {
            json!({})
        };
        items.push(json!({
            "providerId": provider_id,
            "sourceType": manifest.get("sourceType").cloned().unwrap_or_else(|| json!("")),
            "installed": state.get("installed").and_then(Value::as_bool).unwrap_or(false),
            "enabled": state.get("enabled").and_then(Value::as_bool).unwrap_or(false),
            "authStatus": state.get("auth").and_then(|auth| auth.get("status")).and_then(Value::as_str).unwrap_or("unknown"),
            "lastSync": state.get("lastSync").cloned().unwrap_or_else(|| json!({})),
            "cacheItemCount": source_mirror_count(data_dir, &provider_id)?,
            "chatMessageCount": chat_message_count(data_dir, &provider_id)?,
            "runtime": connector_runtime_public(&manifest),
            "runtimeHealth": runtime_health
        }));
    }
    Ok(json!({
        "ok": true,
        "items": items
    }))
}

pub fn query_local_sources(data_dir: &Path, params: Value) -> Result<Value> {
    ensure_connector_workspace(data_dir)?;
    let query = params
        .get("query")
        .or_else(|| params.get("q"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(20)
        .clamp(1, 200) as usize;
    if query.is_empty() {
        return Ok(json!({ "ok": true, "query": query, "total": 0, "items": [] }));
    }

    let mut hits = Vec::new();
    hits.extend(query_chat_messages(data_dir, &query, limit)?);
    hits.extend(query_source_mirrors(data_dir, &query, limit)?);
    hits.extend(query_mail_index(data_dir, &query, limit)?);
    hits.extend(query_external_local_connectors(
        data_dir, &query, limit, &params,
    )?);
    hits.sort_by(|left, right| {
        let left_score = left.get("score").and_then(Value::as_f64).unwrap_or(0.0);
        let right_score = right.get("score").and_then(Value::as_f64).unwrap_or(0.0);
        right_score
            .partial_cmp(&left_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    hits.truncate(limit);
    Ok(json!({
        "ok": true,
        "query": query,
        "total": hits.len(),
        "items": hits,
        "source": "local-data-connectors"
    }))
}

fn built_in_connector_manifests() -> Vec<Value> {
    vec![
        connector_manifest(
            "local-files",
            "file",
            "本地文件夹",
            "builtin:local-files",
            json!({ "type": "none" }),
            vec!["sync", "localQuery"],
        ),
        connector_manifest(
            "macos-mail",
            "mail",
            "macOS Mail",
            "builtin:macos-mail",
            json!({ "type": "none" }),
            vec!["sync", "localQuery"],
        ),
        connector_manifest(
            "knowledge-mirror",
            "knowledge",
            "本地知识镜像",
            "builtin:knowledge-mirror",
            json!({ "type": "none" }),
            vec!["localQuery"],
        ),
        connector_manifest(
            "gmail",
            "mail",
            "Gmail",
            "oauth:gmail",
            oauth_manifest("gmail", &["https://www.googleapis.com/auth/gmail.readonly"]),
            vec!["auth", "sync", "localQuery"],
        ),
        connector_manifest(
            "outlook-mail",
            "mail",
            "Outlook Mail",
            "oauth:outlook-mail",
            oauth_manifest("outlook-mail", &["Mail.Read"]),
            vec!["auth", "sync", "localQuery"],
        ),
        connector_manifest(
            "google-drive",
            "file",
            "Google Drive",
            "oauth:google-drive",
            oauth_manifest(
                "google-drive",
                &["https://www.googleapis.com/auth/drive.readonly"],
            ),
            vec!["auth", "sync", "localQuery"],
        ),
        connector_manifest(
            "onedrive",
            "file",
            "OneDrive",
            "oauth:onedrive",
            oauth_manifest("onedrive", &["Files.Read.All"]),
            vec!["auth", "sync", "localQuery"],
        ),
        connector_manifest(
            "slack",
            "chat",
            "Slack",
            "oauth:slack",
            oauth_manifest(
                "slack",
                &[
                    "channels:history",
                    "groups:history",
                    "im:history",
                    "mpim:history",
                ],
            ),
            vec!["auth", "sync", "localQuery"],
        ),
        connector_manifest(
            "teams",
            "chat",
            "Microsoft Teams",
            "oauth:teams",
            oauth_manifest("teams", &["ChannelMessage.Read.All", "Chat.Read"]),
            vec!["auth", "sync", "localQuery"],
        ),
    ]
}

fn connector_manifest(
    provider_id: &str,
    source_type: &str,
    display_name: &str,
    entrypoint: &str,
    oauth: Value,
    capabilities: Vec<&str>,
) -> Value {
    json!({
        "schemaVersion": CONNECTOR_SCHEMA_VERSION,
        "id": provider_id,
        "providerId": provider_id,
        "sourceType": source_type,
        "displayName": display_name,
        "version": "1.0.0",
        "entrypoint": entrypoint,
        "permissions": [
            format!("source:{}", source_type),
            "local-mirror:write",
            "local-query:read"
        ],
        "oauth": oauth,
        "syncPolicy": {
            "mode": "incremental-local-mirror",
            "realTimeFederatedSearch": false
        },
        "uninstallPolicy": {
            "retainIngestedKnowledge": true,
            "removeLocalMirror": false
        },
        "capabilities": capabilities
    })
}

fn oauth_manifest(provider_id: &str, scopes: &[&str]) -> Value {
    json!({
        "type": "oauth2",
        "providerId": provider_id,
        "authorizationUrl": format!("agentstudio://connectors/{}/oauth/start", provider_id),
        "tokenStorage": "system-keychain",
        "scopes": scopes
    })
}

fn connector_runtime_kind(manifest: &Value) -> &'static str {
    if manifest
        .get("runtime")
        .and_then(|runtime| runtime.get("kind"))
        .and_then(Value::as_str)
        == Some("process")
    {
        return "process";
    }
    let entrypoint = manifest
        .get("entrypoint")
        .and_then(Value::as_str)
        .unwrap_or("");
    if entrypoint.is_empty()
        || entrypoint.starts_with("builtin:")
        || entrypoint.starts_with("oauth:")
    {
        "builtin"
    } else {
        "process"
    }
}

fn connector_runtime_public(manifest: &Value) -> Value {
    let runtime = manifest
        .get("runtime")
        .cloned()
        .unwrap_or_else(|| json!({}));
    json!({
        "kind": connector_runtime_kind(manifest),
        "entrypoint": manifest.get("entrypoint").cloned().unwrap_or_else(|| json!("")),
        "command": runtime.get("command").cloned().unwrap_or_else(|| json!("")),
        "args": runtime.get("args").cloned().unwrap_or_else(|| json!([])),
        "protocol": runtime.get("protocol").cloned().unwrap_or_else(|| json!("stdio-json-v1"))
    })
}

fn connector_supports(manifest: &Value, capability: &str) -> bool {
    manifest
        .get("capabilities")
        .and_then(Value::as_array)
        .map(|items| {
            items.iter().any(|item| {
                item.as_str()
                    .map(|value| value == capability)
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn validate_connector_manifest(manifest: &Value) -> Result<()> {
    let provider = provider_id(manifest)?;
    let source_type = manifest
        .get("sourceType")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if source_type.is_empty()
        || source_type.len() > 64
        || !source_type
            .chars()
            .all(|item| item.is_ascii_lowercase() || item.is_ascii_digit() || item == '-')
    {
        return Err(anyhow!(
            "connector manifest sourceType must be kebab-case for {}",
            provider
        ));
    }
    if connector_runtime_kind(manifest) == "process" {
        let command = connector_process_command_value(manifest)?;
        if command.trim().is_empty() {
            return Err(anyhow!(
                "process connector missing entrypoint command: {}",
                provider
            ));
        }
        if Path::new(command).is_absolute() {
            return Err(anyhow!(
                "process connector entrypoint must be relative to the module directory: {}",
                provider
            ));
        }
        let capabilities = manifest
            .get("capabilities")
            .and_then(Value::as_array)
            .ok_or_else(|| anyhow!("process connector missing capabilities: {}", provider))?;
        if capabilities.is_empty() {
            return Err(anyhow!(
                "process connector capabilities cannot be empty: {}",
                provider
            ));
        }
    }
    Ok(())
}

fn merged_manifests(data_dir: &Path) -> Result<Vec<Value>> {
    let mut by_provider = HashMap::<String, Value>::new();
    for manifest in built_in_connector_manifests() {
        by_provider.insert(provider_id(&manifest)?, manifest);
    }
    let modules_dir = connector_modules_dir(data_dir);
    if modules_dir.exists() {
        for entry in fs::read_dir(modules_dir)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let path = entry.path().join("connector.json");
            if !path.exists() {
                continue;
            }
            let manifest = read_json_file(&path)?;
            by_provider.insert(provider_id(&manifest)?, manifest);
        }
    }
    Ok(by_provider.into_values().collect())
}

fn manifest_from_install_params(data_dir: &Path, params: &Value) -> Result<Value> {
    if let Some(raw_manifest) = params.get("manifest").and_then(Value::as_object) {
        let manifest = Value::Object(raw_manifest.clone());
        let provider = provider_id(&manifest)?;
        if built_in_connector_provider_ids()
            .iter()
            .any(|item| item == &provider)
        {
            return Err(anyhow!(
                "custom connector duplicates built-in providerId: {}",
                provider
            ));
        }
        return Ok(manifest);
    }
    if let Some(package_path) = connector_package_path(params) {
        let manifest_path = connector_manifest_path_from_package(&package_path)?;
        let manifest = read_json_file(&manifest_path)?;
        let provider = provider_id(&manifest)?;
        if built_in_connector_provider_ids()
            .iter()
            .any(|item| item == &provider)
        {
            return Err(anyhow!(
                "custom connector duplicates built-in providerId: {}",
                provider
            ));
        }
        return Ok(manifest);
    }
    let provider = provider_id_from_params(params)?;
    resolve_manifest(data_dir, &provider)
}

fn connector_package_path(params: &Value) -> Option<PathBuf> {
    [
        "packagePath",
        "modulePath",
        "connectorPath",
        "manifestPath",
        "path",
    ]
    .iter()
    .find_map(|key| {
        params
            .get(*key)
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from)
    })
}

fn connector_package_source_dir(params: &Value) -> Result<Option<PathBuf>> {
    let Some(package_path) = connector_package_path(params) else {
        return Ok(None);
    };
    let manifest_path = connector_manifest_path_from_package(&package_path)?;
    Ok(manifest_path.parent().map(Path::to_path_buf))
}

fn connector_manifest_path_from_package(package_path: &Path) -> Result<PathBuf> {
    let path = if package_path.is_dir() {
        package_path.join("connector.json")
    } else {
        package_path.to_path_buf()
    };
    if !path.exists() {
        return Err(anyhow!(
            "connector package missing connector.json: {}",
            package_path.display()
        ));
    }
    Ok(path)
}

fn resolve_manifest(data_dir: &Path, provider_id: &str) -> Result<Value> {
    let provider_id = validate_provider_id(provider_id)?;
    let path = connector_modules_dir(data_dir)
        .join(&provider_id)
        .join("connector.json");
    if path.exists() {
        return read_json_file(&path);
    }
    built_in_connector_manifests()
        .into_iter()
        .find(|item| item.get("providerId").and_then(Value::as_str) == Some(provider_id.as_str()))
        .ok_or_else(|| anyhow!("unknown data connector: {}", provider_id))
}

fn persist_connector_manifest(data_dir: &Path, manifest: &Value) -> Result<()> {
    let provider_id = provider_id(manifest)?;
    let module_dir = connector_module_dir(data_dir, &provider_id);
    fs::create_dir_all(&module_dir)?;
    write_json_atomically(&module_dir.join("connector.json"), manifest)
}

fn persist_connector_package(data_dir: &Path, manifest: &Value, source_dir: &Path) -> Result<()> {
    let provider_id = provider_id(manifest)?;
    let target_dir = connector_module_dir(data_dir, &provider_id);
    if target_dir.exists() {
        fs::remove_dir_all(&target_dir)?;
    }
    copy_connector_package_dir(source_dir, &target_dir)?;
    write_json_atomically(&target_dir.join("connector.json"), manifest)?;
    Ok(())
}

fn copy_connector_package_dir(source_dir: &Path, target_dir: &Path) -> Result<()> {
    let source = fs::canonicalize(source_dir)?;
    if source == fs::canonicalize(target_dir).unwrap_or_else(|_| target_dir.to_path_buf()) {
        return Err(anyhow!(
            "connector package source and target cannot be the same directory"
        ));
    }
    fs::create_dir_all(target_dir)?;
    for entry in fs::read_dir(&source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = target_dir.join(entry.file_name());
        if file_type.is_symlink() {
            return Err(anyhow!(
                "connector packages cannot contain symlinks: {}",
                entry.path().display()
            ));
        }
        if file_type.is_dir() {
            copy_connector_package_dir(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn default_connector_state(manifest: &Value) -> Value {
    let provider = manifest
        .get("providerId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let is_local = matches!(provider, "local-files" | "macos-mail" | "knowledge-mirror");
    let auth_status = manifest
        .get("oauth")
        .and_then(|oauth| oauth.get("type"))
        .and_then(Value::as_str)
        .map(|kind| {
            if kind == "none" {
                "not_required"
            } else {
                "not_started"
            }
        })
        .unwrap_or("not_started");
    json!({
        "schemaVersion": CONNECTOR_SCHEMA_VERSION,
        "providerId": provider,
        "installed": is_local,
        "enabled": is_local,
        "status": if is_local { "enabled" } else { "available" },
        "auth": {
            "status": auth_status,
            "credentialStore": if auth_status == "not_required" { "none" } else { "system-keychain" },
            "updatedAt": ""
        },
        "lastSync": {},
        "createdAt": "",
        "updatedAt": ""
    })
}

fn installed_state(data_dir: &Path, manifest: &Value) -> Result<Value> {
    let provider = provider_id(manifest)?;
    let state = load_connector_state(data_dir, &provider)?
        .unwrap_or_else(|| default_connector_state(manifest));
    if state
        .get("installed")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        != true
    {
        return Err(anyhow!("data connector is not installed: {}", provider));
    }
    Ok(state)
}

fn load_connector_state(data_dir: &Path, provider_id: &str) -> Result<Option<Value>> {
    let path = connector_state_path(data_dir, provider_id)?;
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(read_json_file(&path)?))
}

fn save_connector_state(data_dir: &Path, provider_id: &str, state: &Value) -> Result<()> {
    let path = connector_state_path(data_dir, provider_id)?;
    write_json_atomically(&path, state)
}

fn connector_state_path(data_dir: &Path, provider_id: &str) -> Result<PathBuf> {
    Ok(connector_state_dir(data_dir).join(format!("{}.json", validate_provider_id(provider_id)?)))
}

fn update_connector_state<F>(data_dir: &Path, params: Value, mut updater: F) -> Result<Value>
where
    F: FnMut(&mut Value) -> Result<()>,
{
    let provider_id = provider_id_from_params(&params)?;
    let manifest = resolve_manifest(data_dir, &provider_id)?;
    let mut state = load_connector_state(data_dir, &provider_id)?
        .unwrap_or_else(|| default_connector_state(&manifest));
    updater(&mut state)?;
    state["updatedAt"] = json!(timestamp());
    save_connector_state(data_dir, &provider_id, &state)?;
    Ok(json!({
        "ok": true,
        "providerId": provider_id,
        "connector": public_connector_record(&manifest, &state, data_dir)?
    }))
}

fn public_connector_record(manifest: &Value, state: &Value, data_dir: &Path) -> Result<Value> {
    let provider_id = provider_id(manifest)?;
    Ok(json!({
        "schemaVersion": CONNECTOR_SCHEMA_VERSION,
        "id": manifest.get("id").cloned().unwrap_or_else(|| json!(provider_id.clone())),
        "providerId": provider_id.clone(),
        "sourceType": manifest.get("sourceType").cloned().unwrap_or_else(|| json!("")),
        "displayName": manifest.get("displayName").cloned().unwrap_or_else(|| json!(provider_id.clone())),
        "version": manifest.get("version").cloned().unwrap_or_else(|| json!("")),
        "entrypoint": manifest.get("entrypoint").cloned().unwrap_or_else(|| json!("")),
        "runtime": connector_runtime_public(manifest),
        "permissions": manifest.get("permissions").cloned().unwrap_or_else(|| json!([])),
        "capabilities": manifest.get("capabilities").cloned().unwrap_or_else(|| json!([])),
        "oauth": public_oauth_manifest(manifest.get("oauth").cloned().unwrap_or_else(|| json!({}))),
        "syncPolicy": manifest.get("syncPolicy").cloned().unwrap_or_else(|| json!({})),
        "uninstallPolicy": manifest.get("uninstallPolicy").cloned().unwrap_or_else(|| json!({})),
        "installed": state.get("installed").and_then(Value::as_bool).unwrap_or(false),
        "enabled": state.get("enabled").and_then(Value::as_bool).unwrap_or(false),
        "status": state.get("status").and_then(Value::as_str).unwrap_or("available"),
        "auth": state.get("auth").cloned().unwrap_or_else(|| json!({})),
        "lastSync": state.get("lastSync").cloned().unwrap_or_else(|| json!({})),
        "lifecycle": state.get("lifecycle").cloned().unwrap_or_else(|| json!({})),
        "moduleDirectory": connector_module_dir(data_dir, &provider_id).to_string_lossy().to_string(),
        "cacheDirectory": connector_cache_dir(data_dir).join(&provider_id).to_string_lossy().to_string()
    }))
}

fn public_oauth_manifest(oauth: Value) -> Value {
    json!({
        "type": oauth.get("type").and_then(Value::as_str).unwrap_or("none"),
        "providerId": oauth.get("providerId").and_then(Value::as_str).unwrap_or(""),
        "authorizationUrl": oauth.get("authorizationUrl").and_then(Value::as_str).unwrap_or(""),
        "tokenStorage": oauth.get("tokenStorage").and_then(Value::as_str).unwrap_or("system-keychain"),
        "scopes": oauth.get("scopes").cloned().unwrap_or_else(|| json!([]))
    })
}

fn provider_id(value: &Value) -> Result<String> {
    value
        .get("providerId")
        .or_else(|| value.get("id"))
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("connector manifest missing providerId"))
        .and_then(validate_provider_id)
}

fn provider_id_from_params(params: &Value) -> Result<String> {
    params
        .get("providerId")
        .or_else(|| params.get("id"))
        .or_else(|| params.get("provider"))
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("providerId is required"))
        .and_then(validate_provider_id)
}

fn validate_provider_id(value: &str) -> Result<String> {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty()
        || normalized.len() > 64
        || !normalized
            .chars()
            .all(|item| item.is_ascii_lowercase() || item.is_ascii_digit() || item == '-')
        || !normalized
            .chars()
            .next()
            .map(|item| item.is_ascii_lowercase())
            .unwrap_or(false)
    {
        return Err(anyhow!("invalid providerId: {}", value));
    }
    Ok(normalized)
}

fn read_json_file(path: &Path) -> Result<Value> {
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

fn write_json_atomically(path: &Path, value: &Value) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, format!("{}\n", serde_json::to_string_pretty(value)?))?;
    fs::rename(tmp, path)?;
    Ok(())
}

fn connector_process_command_value(manifest: &Value) -> Result<&str> {
    manifest
        .get("runtime")
        .and_then(|runtime| runtime.get("command"))
        .and_then(Value::as_str)
        .or_else(|| manifest.get("entrypoint").and_then(Value::as_str))
        .map(|value| value.strip_prefix("process:").unwrap_or(value).trim())
        .ok_or_else(|| anyhow!("process connector missing command"))
}

fn connector_process_command_path(data_dir: &Path, manifest: &Value) -> Result<PathBuf> {
    let provider_id = provider_id(manifest)?;
    let module_dir = fs::canonicalize(connector_module_dir(data_dir, &provider_id))?;
    let command_value = connector_process_command_value(manifest)?;
    let command_path = module_dir.join(command_value);
    let canonical = fs::canonicalize(&command_path).map_err(|error| {
        anyhow!(
            "connector entrypoint not found for {}: {} ({})",
            provider_id,
            command_path.display(),
            error
        )
    })?;
    if !canonical.starts_with(&module_dir) {
        return Err(anyhow!(
            "connector entrypoint must stay inside module directory: {}",
            provider_id
        ));
    }
    Ok(canonical)
}

fn connector_process_args(manifest: &Value) -> Vec<String> {
    manifest
        .get("runtime")
        .and_then(|runtime| runtime.get("args"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn invoke_connector_process(
    data_dir: &Path,
    manifest: &Value,
    operation: &str,
    params: Value,
) -> Result<Value> {
    let provider_id = provider_id(manifest)?;
    let command_path = connector_process_command_path(data_dir, manifest)?;
    let module_dir = connector_module_dir(data_dir, &provider_id);
    let cache_dir = connector_cache_dir(data_dir).join(&provider_id);
    fs::create_dir_all(&cache_dir)?;
    let request = json!({
        "protocolVersion": "agentstudio.data-connector.process.v1",
        "operation": operation,
        "providerId": provider_id,
        "params": params,
        "connector": manifest,
        "paths": {
            "dataDir": data_dir.to_string_lossy().to_string(),
            "moduleDir": module_dir.to_string_lossy().to_string(),
            "cacheDir": cache_dir.to_string_lossy().to_string(),
            "stateDir": connector_state_dir(data_dir).to_string_lossy().to_string(),
            "chatDatabasePath": chat_database_path(data_dir).to_string_lossy().to_string()
        },
        "policy": {
            "realTimeFederatedSearch": false,
            "remoteCallsAllowed": false
        }
    });
    let mut child = Command::new(&command_path)
        .args(connector_process_args(manifest))
        .current_dir(&module_dir)
        .env(
            "AGENTSTUDIO_CONNECTOR_PROTOCOL",
            "agentstudio.data-connector.process.v1",
        )
        .env("AGENTSTUDIO_CONNECTOR_OPERATION", operation)
        .env("AGENTSTUDIO_CONNECTOR_PROVIDER_ID", &provider_id)
        .env("AGENTSTUDIO_CONNECTOR_DATA_DIR", data_dir.as_os_str())
        .env("AGENTSTUDIO_CONNECTOR_MODULE_DIR", module_dir.as_os_str())
        .env("AGENTSTUDIO_CONNECTOR_CACHE_DIR", cache_dir.as_os_str())
        .env("AGENTSTUDIO_CONNECTOR_REMOTE_CALLS_ALLOWED", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| anyhow!("failed to launch connector {}: {}", provider_id, error))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(serde_json::to_string(&request)?.as_bytes())?;
    }
    let output = child.wait_with_output()?;
    if !output.status.success() {
        return Err(anyhow!(
            "connector {} operation {} failed: {}",
            provider_id,
            operation,
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(json!({ "ok": true, "items": [] }));
    }
    let value: Value = serde_json::from_str(&stdout).map_err(|error| {
        anyhow!(
            "connector {} operation {} returned invalid JSON: {}",
            provider_id,
            operation,
            error
        )
    })?;
    Ok(value)
}

fn source_items_from_params(params: &Value) -> Result<Vec<Value>> {
    if let Some(items) = params.get("items").and_then(Value::as_array) {
        return Ok(items.clone());
    }
    if let Some(items) = params.get("results").and_then(Value::as_array) {
        return Ok(items.clone());
    }
    if let Some(items) = params.get("hits").and_then(Value::as_array) {
        return Ok(items.clone());
    }
    if let Some(files) = params.get("files").and_then(Value::as_array) {
        return Ok(files
            .iter()
            .filter_map(|item| item.as_str().map(|path| json!({ "fileRef": { "path": path }, "title": Path::new(path).file_name().and_then(|name| name.to_str()).unwrap_or(path) })))
            .collect());
    }
    if let Some(import_path) = params.get("importPath").and_then(Value::as_str) {
        let decoded = read_json_file(Path::new(import_path))?;
        if let Some(items) = decoded.get("items").and_then(Value::as_array) {
            return Ok(items.clone());
        }
        if let Some(items) = decoded.as_array() {
            return Ok(items.clone());
        }
    }
    Ok(Vec::new())
}

fn chat_messages_from_params(params: &Value) -> Result<Vec<Value>> {
    if let Some(items) = params.get("messages").and_then(Value::as_array) {
        return Ok(items.clone());
    }
    if let Some(items) = params.get("items").and_then(Value::as_array) {
        return Ok(items.clone());
    }
    if let Some(items) = params.get("results").and_then(Value::as_array) {
        return Ok(items.clone());
    }
    if let Some(items) = params.get("hits").and_then(Value::as_array) {
        return Ok(items.clone());
    }
    if let Some(import_path) = params.get("importPath").and_then(Value::as_str) {
        let decoded = read_json_file(Path::new(import_path))?;
        if let Some(items) = decoded.get("messages").and_then(Value::as_array) {
            return Ok(items.clone());
        }
        if let Some(items) = decoded.get("items").and_then(Value::as_array) {
            return Ok(items.clone());
        }
        if let Some(items) = decoded.as_array() {
            return Ok(items.clone());
        }
    }
    Ok(Vec::new())
}

fn append_source_mirror(
    data_dir: &Path,
    provider_id: &str,
    source_type: &str,
    sync_batch_id: &str,
    items: &[Value],
) -> Result<usize> {
    let mirror_dir = connector_cache_dir(data_dir).join(provider_id);
    fs::create_dir_all(&mirror_dir)?;
    let path = mirror_dir.join("mirror.jsonl");
    let mut seen = existing_source_external_ids(&path)?;
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    let mut count = 0usize;
    for (index, item) in items.iter().enumerate() {
        let external_id = item
            .get("externalId")
            .or_else(|| item.get("id"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("{}-{}", sync_batch_id, index));
        let dedupe_key = format!("{}::{}", provider_id, external_id);
        if seen.contains(&dedupe_key) {
            continue;
        }
        seen.insert(dedupe_key);
        let record = json!({
            "schemaVersion": CONNECTOR_SCHEMA_VERSION,
            "providerId": provider_id,
            "sourceType": source_type,
            "externalId": external_id,
            "syncBatchId": sync_batch_id,
            "title": item.get("title").or_else(|| item.get("name")).and_then(Value::as_str).unwrap_or(""),
            "snippet": item.get("snippet").or_else(|| item.get("text")).and_then(Value::as_str).unwrap_or(""),
            "timestamp": item.get("timestamp").or_else(|| item.get("capturedAt")).and_then(Value::as_str).unwrap_or(""),
            "fileRef": item.get("fileRef").cloned().unwrap_or_else(|| json!({})),
            "raw": item
        });
        writeln!(file, "{}", serde_json::to_string(&record)?)?;
        count += 1;
    }
    Ok(count)
}

fn existing_source_external_ids(path: &Path) -> Result<HashSet<String>> {
    let mut seen = HashSet::new();
    if !path.exists() {
        return Ok(seen);
    }
    for line in fs::read_to_string(path)?.lines() {
        if let Ok(value) = serde_json::from_str::<Value>(line) {
            let provider = value
                .get("providerId")
                .and_then(Value::as_str)
                .unwrap_or("");
            let external = value
                .get("externalId")
                .and_then(Value::as_str)
                .unwrap_or("");
            if !provider.is_empty() && !external.is_empty() {
                seen.insert(format!("{}::{}", provider, external));
            }
        }
    }
    Ok(seen)
}

fn source_mirror_count(data_dir: &Path, provider_id: &str) -> Result<usize> {
    let path = connector_cache_dir(data_dir)
        .join(provider_id)
        .join("mirror.jsonl");
    if !path.exists() {
        return Ok(0);
    }
    Ok(fs::read_to_string(path)?
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count())
}

fn query_external_local_connectors(
    data_dir: &Path,
    query: &str,
    limit: usize,
    params: &Value,
) -> Result<Vec<Value>> {
    let manifests = merged_manifests(data_dir)?;
    let mut hits = Vec::new();
    for manifest in manifests {
        if connector_runtime_kind(&manifest) != "process"
            || !connector_supports(&manifest, "localQuery")
        {
            continue;
        }
        let provider_id = provider_id(&manifest)?;
        let state = load_connector_state(data_dir, &provider_id)?
            .unwrap_or_else(|| default_connector_state(&manifest));
        if state
            .get("installed")
            .and_then(Value::as_bool)
            .unwrap_or(false)
            != true
            || state
                .get("enabled")
                .and_then(Value::as_bool)
                .unwrap_or(false)
                != true
        {
            continue;
        }
        let mut query_params = params.clone();
        query_params["query"] = json!(query);
        query_params["limit"] = json!(limit);
        query_params["remoteCallsAllowed"] = json!(false);
        let result = invoke_connector_process(data_dir, &manifest, "localQuery", query_params)?;
        let source_items = result
            .get("items")
            .or_else(|| result.get("results"))
            .or_else(|| result.get("hits"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for item in source_items {
            if !item.is_object() {
                continue;
            }
            let mut normalized = item;
            if normalized
                .get("providerId")
                .and_then(Value::as_str)
                .is_none()
            {
                normalized["providerId"] = json!(provider_id);
            }
            if normalized
                .get("sourceType")
                .and_then(Value::as_str)
                .is_none()
            {
                normalized["sourceType"] = manifest
                    .get("sourceType")
                    .cloned()
                    .unwrap_or_else(|| json!("source"));
            }
            if normalized.get("score").and_then(Value::as_f64).is_none() {
                normalized["score"] = json!(0.74);
            }
            normalized["runtime"] = json!({ "kind": "process" });
            hits.push(normalized);
            if hits.len() >= limit {
                return Ok(hits);
            }
        }
    }
    Ok(hits)
}

fn query_source_mirrors(data_dir: &Path, query: &str, limit: usize) -> Result<Vec<Value>> {
    let normalized = query.to_lowercase();
    let mut hits = Vec::new();
    let cache_root = connector_cache_dir(data_dir);
    if !cache_root.exists() {
        return Ok(hits);
    }
    for entry in fs::read_dir(cache_root)? {
        let entry = entry?;
        let path = entry.path().join("mirror.jsonl");
        if !path.exists() {
            continue;
        }
        for line in fs::read_to_string(path)?.lines() {
            if hits.len() >= limit {
                return Ok(hits);
            }
            let value = serde_json::from_str::<Value>(line).unwrap_or_else(|_| json!({}));
            let haystack = format!(
                "{}\n{}\n{}",
                value.get("title").and_then(Value::as_str).unwrap_or(""),
                value.get("snippet").and_then(Value::as_str).unwrap_or(""),
                value.get("raw").map(Value::to_string).unwrap_or_default()
            )
            .to_lowercase();
            if haystack.contains(&normalized) {
                hits.push(json!({
                    "sourceType": value.get("sourceType").cloned().unwrap_or_else(|| json!("source")),
                    "providerId": value.get("providerId").cloned().unwrap_or_else(|| json!("")),
                    "externalId": value.get("externalId").cloned().unwrap_or_else(|| json!("")),
                    "title": value.get("title").cloned().unwrap_or_else(|| json!("")),
                    "snippet": value.get("snippet").cloned().unwrap_or_else(|| json!("")),
                    "timestamp": value.get("timestamp").cloned().unwrap_or_else(|| json!("")),
                    "fileRef": value.get("fileRef").cloned().unwrap_or_else(|| json!({})),
                    "score": 0.72
                }));
            }
        }
    }
    Ok(hits)
}

fn open_chat_database(path: &Path) -> Result<Connection> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA busy_timeout = 5000;

        CREATE TABLE IF NOT EXISTS chat_sources (
          provider_id TEXT PRIMARY KEY,
          source_type TEXT NOT NULL DEFAULT 'chat',
          display_name TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_workspaces (
          workspace_id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          external_id TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(provider_id, external_id)
        );

        CREATE TABLE IF NOT EXISTS chat_conversations (
          conversation_id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL DEFAULT '',
          external_id TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          conversation_type TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(provider_id, workspace_id, external_id)
        );

        CREATE TABLE IF NOT EXISTS chat_participants (
          participant_id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          external_id TEXT NOT NULL,
          display_name TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL,
          UNIQUE(provider_id, external_id)
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
          message_pk INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id TEXT NOT NULL UNIQUE,
          provider_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL DEFAULT '',
          conversation_id TEXT NOT NULL DEFAULT '',
          external_id TEXT NOT NULL,
          sync_batch_id TEXT NOT NULL DEFAULT '',
          sender_id TEXT NOT NULL DEFAULT '',
          sender_name TEXT NOT NULL DEFAULT '',
          text TEXT NOT NULL DEFAULT '',
          timestamp TEXT NOT NULL DEFAULT '',
          thread_ts TEXT NOT NULL DEFAULT '',
          reply_to_external_id TEXT NOT NULL DEFAULT '',
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(provider_id, workspace_id, external_id)
        );

        CREATE TABLE IF NOT EXISTS chat_attachments (
          attachment_id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          external_id TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL DEFAULT '',
          media_type TEXT NOT NULL DEFAULT '',
          local_path TEXT NOT NULL DEFAULT '',
          metadata_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS chat_message_fts USING fts5(
          message_id UNINDEXED,
          provider_id UNINDEXED,
          conversation_id UNINDEXED,
          sender_name,
          text,
          tokenize = 'unicode61 remove_diacritics 0'
        );
        ",
    )?;
    Ok(conn)
}

fn ingest_chat_messages(
    data_dir: &Path,
    provider_id: &str,
    source_type: &str,
    sync_batch_id: &str,
    messages: &[Value],
) -> Result<usize> {
    let conn = open_chat_database(&chat_database_path(data_dir))?;
    let now = timestamp();
    conn.execute(
        "
        INSERT INTO chat_sources (provider_id, source_type, display_name, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?4)
        ON CONFLICT(provider_id) DO UPDATE SET
          source_type = excluded.source_type,
          updated_at = excluded.updated_at
        ",
        params![provider_id, source_type, provider_id, now],
    )?;
    let mut count = 0usize;
    for (index, message) in messages.iter().enumerate() {
        let workspace_external_id = text_field(message, &["workspaceId", "teamId", "tenantId"])
            .unwrap_or_else(|| "default".to_string());
        let workspace_name = text_field(message, &["workspaceName", "teamName"])
            .unwrap_or_else(|| workspace_external_id.clone());
        let workspace_id = stable_chat_id(provider_id, "workspace", &workspace_external_id);
        conn.execute(
            "
            INSERT INTO chat_workspaces (workspace_id, provider_id, external_id, name, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?5)
            ON CONFLICT(provider_id, external_id) DO UPDATE SET
              name = excluded.name,
              updated_at = excluded.updated_at
            ",
            params![workspace_id, provider_id, workspace_external_id, workspace_name, now],
        )?;

        let conversation_external_id =
            text_field(message, &["conversationId", "channelId", "chatId"])
                .unwrap_or_else(|| "default".to_string());
        let conversation_id = stable_chat_id(
            provider_id,
            "conversation",
            &format!("{}::{}", workspace_id, conversation_external_id),
        );
        let conversation_title =
            text_field(message, &["conversationTitle", "channelName", "chatTitle"])
                .unwrap_or_else(|| conversation_external_id.clone());
        conn.execute(
            "
            INSERT INTO chat_conversations (
              conversation_id, provider_id, workspace_id, external_id, title, conversation_type,
              created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
            ON CONFLICT(provider_id, workspace_id, external_id) DO UPDATE SET
              title = excluded.title,
              conversation_type = excluded.conversation_type,
              updated_at = excluded.updated_at
            ",
            params![
                conversation_id,
                provider_id,
                workspace_id,
                conversation_external_id,
                conversation_title,
                text_field(message, &["conversationType", "channelType"]).unwrap_or_default(),
                now
            ],
        )?;

        let sender_external_id = text_field(message, &["senderId", "userId", "fromId"])
            .unwrap_or_else(|| "unknown".to_string());
        let sender_name = text_field(message, &["senderName", "userName", "fromName"])
            .unwrap_or_else(|| sender_external_id.clone());
        let participant_id = stable_chat_id(provider_id, "participant", &sender_external_id);
        conn.execute(
            "
            INSERT INTO chat_participants (
              participant_id, provider_id, external_id, display_name, email, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(provider_id, external_id) DO UPDATE SET
              display_name = excluded.display_name,
              email = excluded.email,
              updated_at = excluded.updated_at
            ",
            params![
                participant_id,
                provider_id,
                sender_external_id,
                sender_name,
                text_field(message, &["senderEmail", "email"]).unwrap_or_default(),
                now
            ],
        )?;

        let external_id = text_field(message, &["externalId", "messageId", "id"])
            .unwrap_or_else(|| format!("{}-{}", sync_batch_id, index));
        let message_id = stable_chat_id(
            provider_id,
            "message",
            &format!("{}::{}::{}", workspace_id, conversation_id, external_id),
        );
        conn.execute(
            "
            INSERT INTO chat_messages (
              message_id, provider_id, workspace_id, conversation_id, external_id,
              sync_batch_id, sender_id, sender_name, text, timestamp, thread_ts,
              reply_to_external_id, metadata_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)
            ON CONFLICT(provider_id, workspace_id, external_id) DO UPDATE SET
              conversation_id = excluded.conversation_id,
              sync_batch_id = excluded.sync_batch_id,
              sender_id = excluded.sender_id,
              sender_name = excluded.sender_name,
              text = excluded.text,
              timestamp = excluded.timestamp,
              thread_ts = excluded.thread_ts,
              reply_to_external_id = excluded.reply_to_external_id,
              metadata_json = excluded.metadata_json,
              updated_at = excluded.updated_at
            ",
            params![
                message_id,
                provider_id,
                workspace_id,
                conversation_id,
                external_id,
                sync_batch_id,
                participant_id,
                sender_name,
                text_field(message, &["text", "body", "snippet"]).unwrap_or_default(),
                text_field(message, &["timestamp", "ts", "sentAt", "createdAt"])
                    .unwrap_or_default(),
                text_field(message, &["threadTs", "threadTimestamp"]).unwrap_or_default(),
                text_field(message, &["replyToExternalId", "parentMessageId"]).unwrap_or_default(),
                serde_json::to_string(message)?,
                now
            ],
        )?;
        let row_id: i64 = conn.query_row(
            "SELECT message_pk FROM chat_messages WHERE message_id = ?1",
            params![message_id],
            |row| row.get(0),
        )?;
        conn.execute(
            "DELETE FROM chat_message_fts WHERE rowid = ?1",
            params![row_id],
        )?;
        conn.execute(
            "
            INSERT INTO chat_message_fts (rowid, message_id, provider_id, conversation_id, sender_name, text)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ",
            params![
                row_id,
                message_id,
                provider_id,
                conversation_id,
                sender_name,
                text_field(message, &["text", "body", "snippet"]).unwrap_or_default()
            ],
        )?;
        count += 1;
    }
    Ok(count)
}

fn query_chat_messages(data_dir: &Path, query: &str, limit: usize) -> Result<Vec<Value>> {
    let conn = open_chat_database(&chat_database_path(data_dir))?;
    let safe_limit = limit.clamp(1, 200) as i64;
    let fts_query = query
        .split_whitespace()
        .filter(|token| !token.trim().is_empty())
        .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" OR ");
    let mut hits = Vec::new();
    if !fts_query.trim().is_empty() {
        let mut stmt = conn.prepare(
            "
            SELECT m.message_id, m.provider_id, m.external_id, m.sender_name, m.text,
                   m.timestamp, m.sync_batch_id, c.conversation_id, c.title, w.workspace_id, w.name
            FROM chat_message_fts f
            JOIN chat_messages m ON m.message_pk = f.rowid
            LEFT JOIN chat_conversations c ON c.conversation_id = m.conversation_id
            LEFT JOIN chat_workspaces w ON w.workspace_id = m.workspace_id
            WHERE chat_message_fts MATCH ?1
            ORDER BY m.timestamp DESC, m.message_pk DESC
            LIMIT ?2
            ",
        )?;
        let rows = stmt.query_map(params![fts_query, safe_limit], chat_hit_row)?;
        hits.extend(rows.collect::<std::result::Result<Vec<_>, _>>()?);
    }
    if hits.is_empty() {
        let like = format!("%{}%", query);
        let mut stmt = conn.prepare(
            "
            SELECT m.message_id, m.provider_id, m.external_id, m.sender_name, m.text,
                   m.timestamp, m.sync_batch_id, c.conversation_id, c.title, w.workspace_id, w.name
            FROM chat_messages m
            LEFT JOIN chat_conversations c ON c.conversation_id = m.conversation_id
            LEFT JOIN chat_workspaces w ON w.workspace_id = m.workspace_id
            WHERE m.text LIKE ?1 OR m.sender_name LIKE ?1 OR c.title LIKE ?1
            ORDER BY m.timestamp DESC, m.message_pk DESC
            LIMIT ?2
            ",
        )?;
        let rows = stmt.query_map(params![like, safe_limit], chat_hit_row)?;
        hits.extend(rows.collect::<std::result::Result<Vec<_>, _>>()?);
    }
    Ok(hits)
}

fn chat_hit_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let text: String = row.get(4)?;
    Ok(json!({
        "sourceType": "chat",
        "providerId": row.get::<_, String>(1)?,
        "externalId": row.get::<_, String>(2)?,
        "title": row.get::<_, String>(8)?,
        "snippet": truncate(&text, 220),
        "timestamp": row.get::<_, String>(5)?,
        "participants": [row.get::<_, String>(3)?],
        "chatRef": {
            "messageId": row.get::<_, String>(0)?,
            "conversationId": row.get::<_, String>(7)?,
            "workspaceId": row.get::<_, String>(9)?,
            "workspaceName": row.get::<_, String>(10)?,
            "syncBatchId": row.get::<_, String>(6)?
        },
        "score": 0.86
    }))
}

fn chat_message_count(data_dir: &Path, provider_id: &str) -> Result<i64> {
    let conn = open_chat_database(&chat_database_path(data_dir))?;
    Ok(conn
        .query_row(
            "SELECT COUNT(*) FROM chat_messages WHERE provider_id = ?1",
            params![provider_id],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(0))
}

fn query_mail_index(data_dir: &Path, query: &str, limit: usize) -> Result<Vec<Value>> {
    let path = data_dir.join("mail-imports").join("index").join("docs.tsv");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let normalized = query.to_lowercase();
    let mut hits = Vec::new();
    for line in fs::read_to_string(path)?.lines() {
        if hits.len() >= limit {
            break;
        }
        if !line.to_lowercase().contains(&normalized) {
            continue;
        }
        let parts = line.split('\t').collect::<Vec<_>>();
        let doc_id = parts.get(0).copied().unwrap_or("");
        hits.push(json!({
            "sourceType": "mail",
            "providerId": "macos-mail",
            "externalId": parts.get(1).copied().unwrap_or(doc_id),
            "title": parts.get(3).copied().unwrap_or("邮件"),
            "snippet": parts.get(10).copied().unwrap_or(""),
            "timestamp": parts.get(15).copied().unwrap_or(""),
            "fileRef": {
                "docId": doc_id,
                "path": parts.get(2).copied().unwrap_or("")
            },
            "score": 0.78
        }));
    }
    Ok(hits)
}

fn stable_chat_id(provider_id: &str, kind: &str, value: &str) -> String {
    format!("chat::{}::{}::{}", provider_id, kind, slug(value))
}

fn slug(value: &str) -> String {
    let mut slug = value
        .chars()
        .map(|item| {
            if item.is_ascii_alphanumeric() || item == '-' {
                item.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    while slug.contains("--") {
        slug = slug.replace("--", "-");
    }
    if slug.is_empty() {
        Uuid::new_v4().to_string()
    } else if slug.len() > 96 {
        slug[..96].to_string()
    } else {
        slug
    }
}

fn text_field(value: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        let text = value
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default();
        if !text.is_empty() {
            return Some(text.to_string());
        }
    }
    None
}

fn truncate(value: &str, max_len: usize) -> String {
    value.chars().take(max_len).collect()
}
