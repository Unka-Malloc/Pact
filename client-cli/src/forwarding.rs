use crate::backend_core::portable_data_dir;
use anyhow::{anyhow, Result};
use serde_json::{json, Map, Value};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

const PROFILE_SCHEMA_VERSION: u32 = 1;
const FORWARDING_DIR: &str = "model-forwarding";
const PROFILES_FILE: &str = "profiles.json";

pub fn list_model_profiles() -> Result<Value> {
    list_model_profiles_in(&portable_data_dir()?)
}

pub fn save_model_profile(params: &Value) -> Result<Value> {
    save_model_profile_in(&portable_data_dir()?, params)
}

pub fn forward(params: &Value) -> Result<Value> {
    forward_in(&portable_data_dir()?, params)
}

fn list_model_profiles_in(data_dir: &Path) -> Result<Value> {
    let document = read_profiles_document(data_dir)?;
    Ok(json!({
        "ok": true,
        "schemaVersion": PROFILE_SCHEMA_VERSION,
        "profiles": document["profiles"].clone()
    }))
}

fn save_model_profile_in(data_dir: &Path, params: &Value) -> Result<Value> {
    let id = profile_id(params)?;
    let provider = params
        .get("provider")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            params
                .get("command")
                .and_then(Value::as_str)
                .map(|_| "command".to_string())
        })
        .or_else(|| {
            params
                .get("url")
                .and_then(Value::as_str)
                .map(|_| "http".to_string())
        })
        .ok_or_else(|| anyhow!("model profile requires --command or --url"))?;

    if provider != "command" && provider != "http" {
        return Err(anyhow!("unsupported forwarding provider: {}", provider));
    }

    let mut profile = Map::new();
    profile.insert("id".to_string(), json!(id));
    profile.insert("provider".to_string(), json!(provider));
    let label = params
        .get("label")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| id.clone());
    profile.insert("label".to_string(), json!(label));
    if let Some(command) = params.get("command").and_then(Value::as_str) {
        profile.insert("command".to_string(), json!(command));
    }
    if let Some(args) = profile_args(params) {
        profile.insert("args".to_string(), args);
    }
    if let Some(url) = params.get("url").and_then(Value::as_str) {
        profile.insert("url".to_string(), json!(url));
    }
    let headers = profile_headers(params);
    if !headers.is_empty() {
        profile.insert("headers".to_string(), Value::Object(headers));
    }

    let mut document = read_profiles_document(data_dir)?;
    let profiles = document
        .get_mut("profiles")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| anyhow!("profiles document is malformed"))?;
    profiles.retain(|item| item.get("id").and_then(Value::as_str) != Some(&id));
    profiles.push(Value::Object(profile));
    profiles.sort_by(|left, right| {
        left.get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .cmp(right.get("id").and_then(Value::as_str).unwrap_or_default())
    });
    write_profiles_document(data_dir, &document)?;

    Ok(json!({
        "ok": true,
        "status": "saved",
        "profile": id,
        "path": display_path(profiles_path(data_dir))
    }))
}

fn forward_in(data_dir: &Path, params: &Value) -> Result<Value> {
    let profile_id = params
        .get("profile")
        .or_else(|| params.get("modelProfile"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow!("forward requires --profile <profile-id>"))?
        .to_string();
    let input = forward_input(params)?;
    let profile = find_profile(data_dir, &profile_id)?;
    let provider = profile
        .get("provider")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match provider {
        "command" => forward_command(&profile_id, &profile, &input),
        "http" => forward_http(&profile_id, &profile, &input),
        _ => Err(anyhow!("unsupported forwarding provider: {}", provider)),
    }
}

fn forward_command(profile_id: &str, profile: &Value, input: &str) -> Result<Value> {
    let command = profile
        .get("command")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow!("command profile is missing command"))?;
    let args = profile_args(profile)
        .unwrap_or_else(|| json!([]))
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|value| value.as_str().map(str::to_string))
        .collect::<Vec<_>>();
    let mut child = Command::new(command)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(input.as_bytes())?;
    }
    let output = child.wait_with_output()?;
    Ok(json!({
        "ok": output.status.success(),
        "profile": profile_id,
        "mode": "thin-forward",
        "provider": "command",
        "statusCode": output.status.code(),
        "output": String::from_utf8_lossy(&output.stdout).to_string(),
        "stderr": String::from_utf8_lossy(&output.stderr).to_string(),
        "planner": false,
        "toolLoop": false,
        "sessionHarness": false
    }))
}

fn forward_http(profile_id: &str, profile: &Value, input: &str) -> Result<Value> {
    let url = profile
        .get("url")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow!("http profile is missing url"))?;
    let mut request = ureq::post(url)
        .set("accept", "application/json")
        .set("content-type", "application/json");
    if let Some(headers) = profile.get("headers").and_then(Value::as_object) {
        for (key, value) in headers {
            if let Some(header_value) = value.as_str() {
                request = request.set(key, header_value);
            }
        }
    }
    let response = request.send_json(json!({
        "input": input,
        "profile": profile_id
    }))?;
    Ok(json!({
        "ok": true,
        "profile": profile_id,
        "mode": "thin-forward",
        "provider": "http",
        "statusCode": response.status(),
        "response": response.into_json::<Value>().unwrap_or_else(|_| json!({})),
        "planner": false,
        "toolLoop": false,
        "sessionHarness": false
    }))
}

fn find_profile(data_dir: &Path, profile_id: &str) -> Result<Value> {
    let document = read_profiles_document(data_dir)?;
    document
        .get("profiles")
        .and_then(Value::as_array)
        .and_then(|profiles| {
            profiles
                .iter()
                .find(|profile| profile.get("id").and_then(Value::as_str) == Some(profile_id))
                .cloned()
        })
        .ok_or_else(|| anyhow!("model profile not found: {}", profile_id))
}

fn read_profiles_document(data_dir: &Path) -> Result<Value> {
    let path = profiles_path(data_dir);
    if !path.exists() {
        return Ok(empty_profiles_document());
    }
    let raw = fs::read_to_string(path)?;
    if raw.trim().is_empty() {
        return Ok(empty_profiles_document());
    }
    let mut document: Value = serde_json::from_str(&raw)?;
    if !document.is_object() {
        document = empty_profiles_document();
    }
    if document.get("profiles").and_then(Value::as_array).is_none() {
        document["profiles"] = json!([]);
    }
    Ok(document)
}

fn write_profiles_document(data_dir: &Path, value: &Value) -> Result<()> {
    let path = profiles_path(data_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!("tmp-{}", timestamp()));
    fs::write(&tmp, format!("{}\n", serde_json::to_string_pretty(value)?))?;
    fs::rename(tmp, path)?;
    Ok(())
}

fn empty_profiles_document() -> Value {
    json!({
        "schemaVersion": PROFILE_SCHEMA_VERSION,
        "profiles": []
    })
}

fn profiles_path(data_dir: &Path) -> PathBuf {
    data_dir.join(FORWARDING_DIR).join(PROFILES_FILE)
}

fn profile_id(params: &Value) -> Result<String> {
    params
        .get("profile")
        .or_else(|| params.get("id"))
        .and_then(Value::as_str)
        .or_else(|| {
            params
                .get("positionals")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| anyhow!("model profile requires --profile <profile-id>"))
}

fn forward_input(params: &Value) -> Result<String> {
    params
        .get("text")
        .or_else(|| params.get("input"))
        .or_else(|| params.get("prompt"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            params
                .get("positionals")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(" ")
                })
        })
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow!("forward requires --text <input>"))
}

fn profile_args(params: &Value) -> Option<Value> {
    params.get("args").and_then(|value| {
        if value.is_array() {
            Some(value.clone())
        } else {
            value
                .as_str()
                .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
                .filter(Value::is_array)
        }
    })
}

fn profile_headers(params: &Value) -> Map<String, Value> {
    let mut headers = params
        .get("headers")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    if let Some(api_key) = params
        .get("apiKey")
        .or_else(|| params.get("pactApiKey"))
        .and_then(Value::as_str)
    {
        headers.insert("X-Pact-Api-Key".to_string(), json!(api_key));
    }
    headers
}

fn timestamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}-{}", now.as_secs(), now.subsec_nanos())
}

fn display_path(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn thin_forwarding_requires_profile() {
        let dir = temp_test_dir("requires-profile");
        let error = forward_in(&dir, &json!({"text": "hello"})).unwrap_err();
        assert!(error.to_string().contains("--profile"));
    }

    #[test]
    fn thin_forwarding_command_profile_round_trip() {
        let dir = temp_test_dir("command-profile");
        save_model_profile_in(
            &dir,
            &json!({
                "profile": "cat",
                "label": "Cat",
                "command": "/bin/cat"
            }),
        )
        .unwrap();

        let result = forward_in(
            &dir,
            &json!({
                "profile": "cat",
                "text": "thin forwarding only"
            }),
        )
        .unwrap();

        assert_eq!(result["ok"], true);
        assert_eq!(result["output"], "thin forwarding only");
        assert_eq!(result["planner"], false);
        assert_eq!(result["toolLoop"], false);
        assert_eq!(result["sessionHarness"], false);
    }

    #[test]
    fn thin_forwarding_profile_store_omits_legacy_agent_fields() {
        let dir = temp_test_dir("store");
        save_model_profile_in(
            &dir,
            &json!({
                "profile": "remote",
                "url": "http://127.0.0.1:7228/forward",
                "apiKey": "secret"
            }),
        )
        .unwrap();

        let raw = fs::read_to_string(profiles_path(&dir)).unwrap();
        assert!(raw.contains("\"profiles\""));
        assert!(raw.contains("\"X-Pact-Api-Key\""));
        assert!(!raw.contains("agent.invoke"));
        assert!(!raw.contains("customHttpAdapter"));
        assert!(!raw.contains("knowledge.agent.answer"));
    }

    fn temp_test_dir(name: &str) -> PathBuf {
        let dir = env::temp_dir().join(format!("pact-forwarding-{}-{}", name, timestamp()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }
}
