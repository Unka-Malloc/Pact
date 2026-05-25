use anyhow::{anyhow, Result};
use directories::UserDirs;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::path::{Path, PathBuf};

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
        "source": "target-adapter-skeleton",
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
    Ok(json!({
        "ok": true,
        "status": "planned",
        "target": def.id,
        "label": def.label,
        "deferredImplementation": "batch-3",
        "plan": {
            "operation": "mcp.config.apply",
            "configPath": params.get("configPath").and_then(Value::as_str).map(str::to_string).or_else(|| default_config_path(def.id).map(display_path)),
            "fields": target_fields(def.id),
            "requiresSnapshot": true,
            "requiresStructuredPatch": true,
            "requiresAtomicWrite": true
        }
    }))
}

pub fn mcp_config_apply(params: &Value) -> Result<Value> {
    let target = target_param(params)?;
    let def = target_def(&target)?;
    Ok(json!({
        "ok": false,
        "status": "protocol_deferred",
        "target": def.id,
        "message": "Target config writes are intentionally deferred to Batch 3, where snapshot, structured patch, atomic write, and rollback are implemented together.",
        "requiredNextVerifier": "client:verify:config-writes"
    }))
}

pub fn mcp_config_rollback(params: &Value) -> Result<Value> {
    let target = target_param(params)?;
    let def = target_def(&target)?;
    Ok(json!({
        "ok": false,
        "status": "protocol_deferred",
        "target": def.id,
        "message": "Target config rollback is intentionally deferred until SnapshotStore-backed writes exist in Batch 3.",
        "requiredNextVerifier": "client:verify:config-writes"
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
        adapter_status: "skeleton".to_string(),
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
    match target {
        "opencode" => json!([
            {"path": "mcp.pact.type", "value": "remote"},
            {"path": "mcp.pact.url", "value": "<base-url>/mcp"},
            {"path": "mcp.pact.headers.X-Pact-Api-Key", "value": "<token-ref>"},
            {"path": "mcp.pact.enabled", "value": true}
        ]),
        "antigravity" => json!([
            {"path": "mcpServers.pact.serverUrl", "value": "<base-url>/mcp"},
            {"path": "mcpServers.pact.headers.X-Pact-Api-Key", "value": "<token-ref>"},
            {"path": "mcpServers.pact.disabled", "value": false}
        ]),
        "codex" => json!([
            {"path": "mcp_servers.pact.url", "value": "<base-url>/mcp"},
            {"path": "mcp_servers.pact.bearer_token_env_var", "value": "PACT_MCP_TOKEN"}
        ]),
        "gemini-cli" => json!([
            {"path": "mcpServers.pact.transport", "value": "http"},
            {"path": "mcpServers.pact.url", "value": "<base-url>/mcp"},
            {"path": "mcpServers.pact.headers.X-Pact-Api-Key", "value": "<token-ref>"}
        ]),
        "openclaw" => json!([
            {"path": "vm.name", "value": "<vm>"},
            {"path": "mcp.pact.url", "value": "<vm-base-url>/mcp"},
            {"path": "mcp.pact.headers.X-Pact-Api-Key", "value": "<token-ref>"}
        ]),
        "cursor" | "windsurf" => json!([
            {"path": "mcpServers.pact.command", "value": "pact-mcp"},
            {"path": "mcpServers.pact.args", "value": ["server"]}
        ]),
        _ => json!([]),
    }
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
}
