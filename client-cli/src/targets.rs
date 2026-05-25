use anyhow::{anyhow, Result};
use directories::UserDirs;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const SUPPORTED_ACTIONS: &[&str] = &[
    "scan",
    "add",
    "inspect",
    "mcp.config.plan",
    "mcp.config.apply",
    "mcp.config.rollback",
];

#[derive(Clone, Debug)]
struct TargetDef {
    id: &'static str,
    label: &'static str,
    kind: &'static str,
    config_hint: &'static str,
    binary_names: &'static [&'static str],
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetCandidate {
    pub target: String,
    pub label: String,
    pub kind: String,
    pub status: String,
    pub configured: bool,
    pub confidence: f64,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub binary_path: Option<String>,
    pub adapter_status: String,
    pub supported_actions: Vec<String>,
}

fn target_defs() -> Vec<TargetDef> {
    vec![
        TargetDef {
            id: "codex",
            label: "Codex",
            kind: "cli",
            config_hint: "Codex MCP configuration",
            binary_names: &["codex"],
        },
        TargetDef {
            id: "opencode",
            label: "OpenCode",
            kind: "cli",
            config_hint: "OpenCode remote MCP configuration",
            binary_names: &["opencode"],
        },
        TargetDef {
            id: "openclaw",
            label: "OpenClaw",
            kind: "vm-cli",
            config_hint: "OpenClaw VM MCP configuration",
            binary_names: &["openclaw"],
        },
        TargetDef {
            id: "antigravity",
            label: "Antigravity",
            kind: "cli",
            config_hint: "Antigravity MCP configuration",
            binary_names: &["antigravity"],
        },
        TargetDef {
            id: "cursor",
            label: "Cursor",
            kind: "desktop-agent",
            config_hint: "Cursor MCP configuration",
            binary_names: &["cursor"],
        },
        TargetDef {
            id: "windsurf",
            label: "Windsurf",
            kind: "desktop-agent",
            config_hint: "Windsurf MCP configuration",
            binary_names: &["windsurf"],
        },
        TargetDef {
            id: "gemini-cli",
            label: "Gemini CLI",
            kind: "cli",
            config_hint: "Gemini CLI MCP configuration",
            binary_names: &["gemini"],
        },
    ]
}

pub fn scan_targets() -> Result<Value> {
    let candidates = target_defs()
        .iter()
        .map(scan_target)
        .collect::<Result<Vec<_>>>()?;
    Ok(json!({
        "ok": true,
        "schemaVersion": 1,
        "source": "target-adapters",
        "candidates": candidates,
    }))
}

pub fn add_target(params: &Value) -> Result<Value> {
    let target = target_param(params)?;
    let def = target_def(&target)?;
    Ok(json!({
        "ok": true,
        "status": "accepted",
        "target": def.id,
        "label": def.label,
        "manual": true,
        "configPath": params.get("configPath").and_then(Value::as_str),
        "binaryPath": params.get("binaryPath").and_then(Value::as_str),
        "nextAction": "mcp.config.plan",
    }))
}

pub fn inspect_target(target: &str) -> Result<Value> {
    let def = target_def(target)?;
    let candidate = scan_target(&def)?;
    Ok(json!({
        "ok": true,
        "target": candidate,
        "fields": target_fields(def.id),
        "writePolicy": {
            "snapshotRequired": true,
            "structuredPatchRequired": true,
            "atomicWriteRequired": true,
            "preserveUnrelatedConfig": true
        }
    }))
}

pub fn mcp_config_plan(params: &Value) -> Result<Value> {
    let target = target_param(params)?;
    let def = target_def(&target)?;
    let config_path = resolve_config_path(&def, params).ok();
    let base_url = normalize_base_url(params);
    let token_ref = token_ref(params);
    Ok(json!({
        "ok": true,
        "status": "planned",
        "target": def.id,
        "label": def.label,
        "plan": {
            "operation": "mcp.config.apply",
            "configPath": config_path.map(display_path),
            "baseUrl": base_url,
            "tokenRef": token_ref,
            "fields": target_fields_with_values(def.id, &base_url, &token_ref),
            "requiresSnapshot": true,
            "requiresStructuredPatch": true,
            "requiresAtomicWrite": true,
            "rollbackCommand": "pact-client mcp config rollback --target <target> --snapshot-id <snapshotId>"
        }
    }))
}

pub fn mcp_config_apply(params: &Value) -> Result<Value> {
    let target = target_param(params)?;
    let def = target_def(&target)?;
    let config_path = resolve_config_path(&def, params)?;
    let base_url = normalize_base_url(params);
    let token_ref = token_ref(params);
    let current = fs::read_to_string(&config_path).unwrap_or_default();
    let before_hash = hash_text(&current);
    if let Some(expected_hash) = params.get("expectedHash").and_then(Value::as_str) {
        if expected_hash != before_hash {
            return Ok(json!({
                "ok": false,
                "status": "field_conflict",
                "target": def.id,
                "configPath": display_path(config_path),
                "expectedHash": expected_hash,
                "actualHash": before_hash,
                "message": "Target config changed after plan; refusing to overwrite without a new plan."
            }));
        }
    }
    let fields = target_fields_with_values(def.id, &base_url, &token_ref);
    let new_content = apply_structured_patch(def.id, &current, &base_url, &token_ref)?;
    let snapshot = write_snapshot(&config_path, def.id, &current)?;
    atomic_write(&config_path, &new_content)?;
    let after_hash = hash_text(&new_content);
    Ok(json!({
        "ok": true,
        "status": "applied",
        "target": def.id,
        "configPath": display_path(config_path),
        "snapshotId": snapshot.0,
        "snapshotPath": display_path(snapshot.1),
        "beforeHash": before_hash,
        "afterHash": after_hash,
        "patch": {
            "type": "structured",
            "fields": fields
        }
    }))
}

pub fn mcp_config_rollback(params: &Value) -> Result<Value> {
    let target = target_param(params)?;
    let def = target_def(&target)?;
    let snapshot_path = snapshot_path_from_params(params)?;
    let raw = fs::read_to_string(&snapshot_path)?;
    let snapshot: Value = serde_json::from_str(&raw)?;
    let config_path = snapshot
        .get("configPath")
        .and_then(Value::as_str)
        .map(PathBuf::from)
        .ok_or_else(|| anyhow!("Snapshot is missing configPath"))?;
    let existed = snapshot
        .get("existed")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let original_content = snapshot
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let before_rollback = fs::read_to_string(&config_path).unwrap_or_default();
    let rollback_snapshot = write_snapshot(&config_path, def.id, &before_rollback)?;
    if existed {
        atomic_write(&config_path, original_content)?;
    } else if config_path.exists() {
        fs::remove_file(&config_path)?;
    }
    Ok(json!({
        "ok": true,
        "status": "rolled_back",
        "target": def.id,
        "configPath": display_path(config_path),
        "restoredSnapshotPath": display_path(snapshot_path),
        "preRollbackSnapshotId": rollback_snapshot.0,
        "preRollbackSnapshotPath": display_path(rollback_snapshot.1)
    }))
}

fn scan_target(def: &TargetDef) -> Result<TargetCandidate> {
    let config_path = default_config_path(def.id);
    let binary_path = find_binary(def.binary_names);
    let configured = config_path
        .as_ref()
        .map(|path| config_has_pact(path))
        .unwrap_or(false);
    let config_exists = config_path
        .as_ref()
        .map(|path| path.exists())
        .unwrap_or(false);
    let detected = config_exists || binary_path.is_some();
    let status = if configured {
        "configured"
    } else if detected {
        "detected"
    } else {
        "not-detected"
    };
    let confidence = if configured {
        1.0
    } else if detected {
        0.72
    } else {
        0.15
    };
    let detail = match (&config_path, &binary_path) {
        (Some(config), Some(binary)) => {
            format!(
                "{}: {}; binary: {}",
                def.config_hint,
                config.display(),
                binary.display()
            )
        }
        (Some(config), None) => format!("{}: {}", def.config_hint, config.display()),
        (None, Some(binary)) => format!("binary: {}", binary.display()),
        (None, None) => def.config_hint.to_string(),
    };
    Ok(TargetCandidate {
        target: def.id.to_string(),
        label: def.label.to_string(),
        kind: def.kind.to_string(),
        status: status.to_string(),
        configured,
        confidence,
        detail,
        config_path: config_path.map(display_path),
        binary_path: binary_path.map(display_path),
        adapter_status: "implemented".to_string(),
        supported_actions: SUPPORTED_ACTIONS
            .iter()
            .map(|item| item.to_string())
            .collect(),
    })
}

fn target_def(target: &str) -> Result<TargetDef> {
    let normalized = normalize_target(target);
    target_defs()
        .into_iter()
        .find(|def| def.id == normalized)
        .ok_or_else(|| anyhow!("Unsupported target adapter: {}", target))
}

fn target_param(params: &Value) -> Result<String> {
    params
        .get("target")
        .and_then(Value::as_str)
        .or_else(|| {
            params
                .get("positionals")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(Value::as_str)
        })
        .map(normalize_target)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow!("Missing --target <target>"))
}

fn normalize_target(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "gemini" | "gemini_cli" => "gemini-cli".to_string(),
        "open-code" | "open_code" => "opencode".to_string(),
        "openclaw-kate" | "openclaw_kate" => "openclaw".to_string(),
        other => other.to_string(),
    }
}

fn target_fields(target: &str) -> Value {
    target_fields_with_values(target, "<base-url>/mcp", "<token-ref>")
}

fn target_fields_with_values(target: &str, base_url: &str, token_ref: &str) -> Value {
    let mcp_url = mcp_url(base_url);
    match target {
        "opencode" => json!([
            {"path": "mcp.pact.type", "value": "remote"},
            {"path": "mcp.pact.url", "value": mcp_url},
            {"path": "mcp.pact.headers.X-Pact-Api-Key", "value": token_ref},
            {"path": "mcp.pact.enabled", "value": true}
        ]),
        "antigravity" => json!([
            {"path": "mcpServers.pact.serverUrl", "value": mcp_url},
            {"path": "mcpServers.pact.headers.X-Pact-Api-Key", "value": token_ref},
            {"path": "mcpServers.pact.disabled", "value": false}
        ]),
        "codex" => json!([
            {"path": "mcp_servers.pact.url", "value": mcp_url},
            {"path": "mcp_servers.pact.bearer_token_env_var", "value": "PACT_MCP_TOKEN"}
        ]),
        "gemini-cli" => json!([
            {"path": "mcpServers.pact.transport", "value": "http"},
            {"path": "mcpServers.pact.url", "value": mcp_url},
            {"path": "mcpServers.pact.headers.X-Pact-Api-Key", "value": token_ref}
        ]),
        "openclaw" => json!([
            {"path": "vm.name", "value": "<vm>"},
            {"path": "mcp.pact.url", "value": mcp_url},
            {"path": "mcp.pact.headers.X-Pact-Api-Key", "value": token_ref}
        ]),
        "cursor" | "windsurf" => json!([
            {"path": "mcpServers.pact.command", "value": "pact-mcp"},
            {"path": "mcpServers.pact.args", "value": ["server"]}
        ]),
        _ => json!([]),
    }
}

fn apply_structured_patch(
    target: &str,
    current: &str,
    base_url: &str,
    token_ref: &str,
) -> Result<String> {
    match target {
        "codex" => apply_codex_patch(current, base_url),
        "opencode" | "antigravity" | "cursor" | "windsurf" | "gemini-cli" | "openclaw" => {
            apply_json_patch(target, current, base_url, token_ref)
        }
        _ => Err(anyhow!("Unsupported target adapter: {}", target)),
    }
}

fn apply_json_patch(
    target: &str,
    current: &str,
    base_url: &str,
    token_ref: &str,
) -> Result<String> {
    let parsed = if current.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(&strip_json_comments(current))
            .map_err(|error| anyhow!("Unable to parse target JSON config: {}", error))?
    };
    let mut config = parsed.as_object().cloned().unwrap_or_else(Map::new);
    let patch = json_patch_entries(target, base_url, token_ref);
    for (path, value) in patch {
        set_json_path(&mut config, &path, value)?;
    }
    Ok(format!(
        "{}\n",
        serde_json::to_string_pretty(&Value::Object(config))?
    ))
}

fn apply_codex_patch(current: &str, base_url: &str) -> Result<String> {
    let mut root = if current.trim().is_empty() {
        toml::map::Map::new()
    } else {
        current
            .parse::<toml::Value>()
            .map_err(|error| anyhow!("Unable to parse Codex TOML config: {}", error))?
            .as_table()
            .cloned()
            .ok_or_else(|| anyhow!("Codex TOML config must be a table"))?
    };
    let mcp_servers = root
        .entry("mcp_servers".to_string())
        .or_insert_with(|| toml::Value::Table(toml::map::Map::new()))
        .as_table_mut()
        .ok_or_else(|| anyhow!("Codex mcp_servers must be a table"))?;
    let mut pact = toml::map::Map::new();
    pact.insert("url".to_string(), toml::Value::String(mcp_url(base_url)));
    pact.insert(
        "bearer_token_env_var".to_string(),
        toml::Value::String("PACT_MCP_TOKEN".to_string()),
    );
    mcp_servers.insert("pact".to_string(), toml::Value::Table(pact));
    Ok(toml::to_string_pretty(&toml::Value::Table(root))?)
}

fn json_patch_entries(target: &str, base_url: &str, token_ref: &str) -> Vec<(String, Value)> {
    let mcp_url = mcp_url(base_url);
    match target {
        "opencode" => vec![
            ("mcp.pact.type".to_string(), json!("remote")),
            ("mcp.pact.url".to_string(), json!(mcp_url)),
            (
                "mcp.pact.headers.X-Pact-Api-Key".to_string(),
                json!(token_ref),
            ),
            ("mcp.pact.enabled".to_string(), json!(true)),
        ],
        "antigravity" => vec![
            ("mcpServers.pact.serverUrl".to_string(), json!(mcp_url)),
            (
                "mcpServers.pact.headers.X-Pact-Api-Key".to_string(),
                json!(token_ref),
            ),
            ("mcpServers.pact.disabled".to_string(), json!(false)),
        ],
        "gemini-cli" => vec![
            ("mcpServers.pact.transport".to_string(), json!("http")),
            ("mcpServers.pact.url".to_string(), json!(mcp_url)),
            (
                "mcpServers.pact.headers.X-Pact-Api-Key".to_string(),
                json!(token_ref),
            ),
        ],
        "openclaw" => vec![
            ("mcp.pact.type".to_string(), json!("remote")),
            ("mcp.pact.url".to_string(), json!(mcp_url)),
            (
                "mcp.pact.headers.X-Pact-Api-Key".to_string(),
                json!(token_ref),
            ),
            ("mcp.pact.enabled".to_string(), json!(true)),
        ],
        "cursor" | "windsurf" => vec![
            ("mcpServers.pact.command".to_string(), json!("pact-mcp")),
            ("mcpServers.pact.args".to_string(), json!(["server"])),
        ],
        _ => Vec::new(),
    }
}

fn set_json_path(root: &mut Map<String, Value>, path: &str, value: Value) -> Result<()> {
    let mut current = root;
    let parts = path.split('.').collect::<Vec<_>>();
    for part in parts.iter().take(parts.len().saturating_sub(1)) {
        let entry = current
            .entry((*part).to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        if !entry.is_object() {
            *entry = Value::Object(Map::new());
        }
        current = entry
            .as_object_mut()
            .ok_or_else(|| anyhow!("Unable to create config object for {}", path))?;
    }
    let Some(last) = parts.last() else {
        return Err(anyhow!("Empty config path"));
    };
    current.insert((*last).to_string(), value);
    Ok(())
}

fn strip_json_comments(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut in_string = false;
    let mut escaped = false;
    while let Some(ch) = chars.next() {
        if in_string {
            escaped = ch == '\\' && !escaped;
            if ch == '"' && !escaped {
                in_string = false;
            }
            output.push(ch);
            if ch != '\\' {
                escaped = false;
            }
            continue;
        }
        if ch == '"' {
            in_string = true;
            output.push(ch);
            continue;
        }
        if ch == '/' {
            match chars.peek() {
                Some('/') => {
                    chars.next();
                    for next in chars.by_ref() {
                        if next == '\n' {
                            output.push('\n');
                            break;
                        }
                    }
                    continue;
                }
                Some('*') => {
                    chars.next();
                    let mut previous = '\0';
                    for next in chars.by_ref() {
                        if previous == '*' && next == '/' {
                            break;
                        }
                        previous = next;
                    }
                    continue;
                }
                _ => {}
            }
        }
        output.push(ch);
    }
    output
}

fn resolve_config_path(def: &TargetDef, params: &Value) -> Result<PathBuf> {
    params
        .get("configPath")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| default_config_path(def.id))
        .ok_or_else(|| anyhow!("{} requires --config-path for config writes", def.label))
}

fn normalize_base_url(params: &Value) -> String {
    params
        .get("baseUrl")
        .or_else(|| params.get("url"))
        .and_then(Value::as_str)
        .unwrap_or("http://127.0.0.1:7228")
        .trim()
        .trim_end_matches('/')
        .to_string()
}

fn token_ref(params: &Value) -> String {
    params
        .get("token")
        .or_else(|| params.get("apiKey"))
        .or_else(|| params.get("pactApiKey"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("${PACT_MCP_TOKEN}")
        .to_string()
}

fn mcp_url(base_url: &str) -> String {
    if base_url.ends_with("/mcp") {
        base_url.to_string()
    } else {
        format!("{}/mcp", base_url.trim_end_matches('/'))
    }
}

fn write_snapshot(config_path: &Path, target: &str, content: &str) -> Result<(String, PathBuf)> {
    let snapshot_id = format!("{}-{}", target, snapshot_stamp());
    let snapshot_dir = config_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(".pact-snapshots");
    fs::create_dir_all(&snapshot_dir)?;
    let snapshot_path = snapshot_dir.join(format!("{}.json", snapshot_id));
    let record = json!({
        "schemaVersion": 1,
        "snapshotId": snapshot_id,
        "target": target,
        "configPath": display_path(config_path.to_path_buf()),
        "capturedAt": snapshot_stamp(),
        "existed": config_path.exists(),
        "hash": hash_text(content),
        "content": content,
    });
    atomic_write(&snapshot_path, &serde_json::to_string_pretty(&record)?)?;
    Ok((snapshot_id, snapshot_path))
}

fn snapshot_path_from_params(params: &Value) -> Result<PathBuf> {
    if let Some(path) = params.get("snapshotPath").and_then(Value::as_str) {
        return Ok(PathBuf::from(path));
    }
    let snapshot_id = params
        .get("snapshotId")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("Missing --snapshot-id or --snapshot-path"))?;
    let target = target_param(params)?;
    let def = target_def(&target)?;
    let config_path = resolve_config_path(&def, params)?;
    Ok(config_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(".pact-snapshots")
        .join(format!("{}.json", snapshot_id)))
}

fn atomic_write(path: &Path, content: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension()
            .and_then(|item| item.to_str())
            .unwrap_or("pact")
    ));
    {
        let mut file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&tmp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
    }
    match fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(error) => {
            if path.exists() {
                fs::remove_file(path)?;
                fs::rename(&tmp, path)?;
                Ok(())
            } else {
                Err(error.into())
            }
        }
    }
}

fn hash_text(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn snapshot_stamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}-{}", now.as_secs(), now.subsec_nanos())
}

fn default_config_path(target: &str) -> Option<PathBuf> {
    let home = UserDirs::new()?.home_dir().to_path_buf();
    match target {
        "codex" => Some(home.join(".codex").join("config.toml")),
        "opencode" => Some(home.join(".config").join("opencode").join("opencode.jsonc")),
        "antigravity" => Some(
            home.join(".gemini")
                .join("antigravity")
                .join("mcp_config.json"),
        ),
        "cursor" => {
            #[cfg(target_os = "macos")]
            {
                Some(home.join("Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"))
            }
            #[cfg(target_os = "windows")]
            {
                Some(directories::BaseDirs::new()?.data_dir().join("Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"))
            }
            #[cfg(target_os = "linux")]
            {
                Some(home.join(".config/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"))
            }
        }
        "windsurf" => Some(
            home.join(".codeium")
                .join("windsurf")
                .join("mcp_config.json"),
        ),
        "gemini-cli" => Some(home.join(".gemini").join("settings.json")),
        "openclaw" => None,
        _ => None,
    }
}

fn config_has_pact(path: &Path) -> bool {
    let Ok(content) = std::fs::read_to_string(path) else {
        return false;
    };
    content.contains("\"pact\"")
        || content.contains("[mcp_servers.pact]")
        || content.contains("pact-mcp")
}

fn find_binary(names: &[&str]) -> Option<PathBuf> {
    let path_var = env::var_os("PATH")?;
    for dir in env::split_paths(&path_var) {
        for name in names {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
            #[cfg(target_os = "windows")]
            {
                let candidate = dir.join(format!("{}.exe", name));
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

fn display_path(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_includes_required_first_targets() {
        let scan = scan_targets().unwrap();
        let ids = scan["candidates"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| item["target"].as_str().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            ids,
            vec![
                "codex",
                "opencode",
                "openclaw",
                "antigravity",
                "cursor",
                "windsurf",
                "gemini-cli"
            ]
        );
    }

    #[test]
    fn opencode_plan_exposes_real_remote_mcp_shape() {
        let plan = mcp_config_plan(&json!({"target": "opencode"})).unwrap();
        let fields = plan["plan"]["fields"].as_array().unwrap();
        let paths = fields
            .iter()
            .map(|item| item["path"].as_str().unwrap())
            .collect::<Vec<_>>();
        assert!(paths.contains(&"mcp.pact.url"));
        assert!(paths.contains(&"mcp.pact.headers.X-Pact-Api-Key"));
        assert!(paths.contains(&"mcp.pact.enabled"));
    }

    #[test]
    fn config_write_opencode_apply_uses_snapshot_and_preserves_unrelated_config() {
        let dir = temp_test_dir("opencode-apply");
        let config_path = dir.join("opencode.jsonc");
        fs::write(
            &config_path,
            r#"{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "other": {
      "type": "remote",
      "url": "https://example.test/mcp",
      "enabled": true
    }
  }
}"#,
        )
        .unwrap();

        let result = mcp_config_apply(&json!({
            "target": "opencode",
            "configPath": display_path(config_path.clone()),
            "baseUrl": "http://127.0.0.1:7228",
            "token": "test-token"
        }))
        .unwrap();

        assert_eq!(result["ok"], true);
        assert_eq!(result["status"], "applied");
        let updated: Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert_eq!(updated["$schema"], "https://opencode.ai/config.json");
        assert_eq!(updated["mcp"]["other"]["url"], "https://example.test/mcp");
        assert_eq!(updated["mcp"]["pact"]["type"], "remote");
        assert_eq!(updated["mcp"]["pact"]["url"], "http://127.0.0.1:7228/mcp");
        assert_eq!(
            updated["mcp"]["pact"]["headers"]["X-Pact-Api-Key"],
            "test-token"
        );
        assert_eq!(updated["mcp"]["pact"]["enabled"], true);
        assert!(PathBuf::from(result["snapshotPath"].as_str().unwrap()).exists());
    }

    #[test]
    fn config_write_rollback_restores_snapshot_content() {
        let dir = temp_test_dir("opencode-rollback");
        let config_path = dir.join("opencode.jsonc");
        let original = r#"{"mcp":{"other":{"enabled":true}}}"#;
        fs::write(&config_path, original).unwrap();
        let apply = mcp_config_apply(&json!({
            "target": "opencode",
            "configPath": display_path(config_path.clone()),
            "baseUrl": "http://localhost:7228",
            "token": "rollback-token"
        }))
        .unwrap();
        assert_ne!(fs::read_to_string(&config_path).unwrap(), original);

        let rollback = mcp_config_rollback(&json!({
            "target": "opencode",
            "configPath": display_path(config_path.clone()),
            "snapshotPath": apply["snapshotPath"].as_str().unwrap()
        }))
        .unwrap();

        assert_eq!(rollback["ok"], true);
        assert_eq!(fs::read_to_string(&config_path).unwrap(), original);
    }

    #[test]
    fn config_write_expected_hash_prevents_stale_overwrite() {
        let dir = temp_test_dir("opencode-conflict");
        let config_path = dir.join("opencode.jsonc");
        fs::write(&config_path, r#"{"mcp":{}}"#).unwrap();

        let result = mcp_config_apply(&json!({
            "target": "opencode",
            "configPath": display_path(config_path.clone()),
            "expectedHash": "stale",
            "token": "blocked"
        }))
        .unwrap();

        assert_eq!(result["ok"], false);
        assert_eq!(result["status"], "field_conflict");
        assert_eq!(fs::read_to_string(&config_path).unwrap(), r#"{"mcp":{}}"#);
    }

    fn temp_test_dir(name: &str) -> PathBuf {
        let dir = env::temp_dir().join(format!("pact-targets-{}-{}", name, snapshot_stamp()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }
}
