use anyhow::Result;
use pact_client_native::backend_core::{load_rpc_endpoint_from_portable_data, Backend};
use serde_json::{json, Value};
use std::env;
use std::path::Path;

fn main() -> Result<()> {
    env_logger::init();
    let args = env::args().skip(1).collect::<Vec<_>>();
    if args.is_empty() {
        print_usage();
        return Ok(());
    }

    match args.as_slice() {
        [scope, action] if scope == "daemon" && action == "start" => {
            pact_client_native::backend_core::run_daemon_forever()
        }
        [scope, action] if scope == "daemon" && action == "status" => {
            let backend = Backend::from_portable_data_dir()?;
            let state = std::fs::read_to_string(backend.runtime_state_path())
                .ok()
                .and_then(|raw| serde_json::from_str::<Value>(&raw).ok());
            let rpc = load_rpc_endpoint_from_portable_data().ok();
            print_json(&json!({
                "ok": true,
                "status": state
                    .as_ref()
                    .and_then(|item| item.get("daemonStatus"))
                    .and_then(Value::as_str)
                    .unwrap_or("offline"),
                "runtimeState": state,
                "rpc": rpc
            }));
            Ok(())
        }
        [scope, action] if scope == "daemon" && action == "stop" => {
            let backend = Backend::from_portable_data_dir()?;
            backend.request_shutdown()?;
            print_json(&json!({ "ok": true, "status": "stopping" }));
            Ok(())
        }
        [scope, action] if scope == "config" && action == "get" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("config.get", json!({}), None)?);
            Ok(())
        }
        [scope, action, payload] if scope == "config" && action == "set" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("config.set", parse_json_arg(payload), None)?);
            Ok(())
        }
        [scope, action, payload] if scope == "config" && action == "patch" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("config.patch", parse_json_arg(payload), None)?);
            Ok(())
        }
        [scope, action] if scope == "logs" && action == "tail" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method(
                "state.logs.tail",
                json!({ "maxLines": 2000 }),
                None,
            )?);
            Ok(())
        }
        [scope, action] if scope == "logs" && action == "clear" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("state.logs.clear", json!({}), None)?);
            Ok(())
        }
        [scope, action, path] if scope == "files" && action == "collect" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method(
                "file.collect",
                json!({ "roots": [path], "includeAllFiles": false }),
                None,
            )?);
            Ok(())
        }
        [scope, action, path] if scope == "files" && action == "open" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method(
                "file.open",
                json!({ "path": path, "reveal": false }),
                None,
            )?);
            Ok(())
        }
        [scope, action, method, path] if scope == "server" && action == "api" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method(
                "server.api",
                json!({ "method": method, "path": path }),
                None,
            )?);
            Ok(())
        }
        [scope, action, method, path, value] if scope == "server" && action == "api" => {
            let backend = Backend::from_portable_data_dir()?;
            let mut params = json!({ "method": method, "path": path });
            if value.starts_with("http://") || value.starts_with("https://") {
                params["serviceBaseUrl"] = json!(value);
            } else {
                params["body"] = parse_json_arg(value);
            }
            print_json(&backend.execute_method("server.api", params, None)?);
            Ok(())
        }
        [scope, action, method, path, body, service_base_url]
            if scope == "server" && action == "api" =>
        {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method(
                "server.api",
                json!({
                    "method": method,
                    "path": path,
                    "body": parse_json_arg(body),
                    "serviceBaseUrl": service_base_url
                }),
                None,
            )?);
            Ok(())
        }
        [scope, rest @ ..] if scope == "server" => {
            let backend = Backend::from_portable_data_dir()?;
            let args = rest.iter().map(|item| json!(item)).collect::<Vec<_>>();
            print_json(&backend.execute_method("server.cli", json!({ "args": args }), None)?);
            Ok(())
        }
        [scope, action] if scope == "vocabulary" && action == "pull" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("vocabulary.pull", json!({}), None)?);
            Ok(())
        }
        [scope, action] if scope == "vocabulary" && action == "apply" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("vocabulary.applyToIndex", json!({}), None)?);
            Ok(())
        }
        [scope, action] if scope == "index" && action == "rebuild" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("mail.index.rebuild", json!({}), None)?);
            Ok(())
        }
        [scope, action] if scope == "mail" && action == "auth" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("mail.auth.request", json!({}), None)?);
            Ok(())
        }
        [scope, action, subaction]
            if scope == "mail" && action == "import" && subaction == "start" =>
        {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("mail.import.start", json!({}), None)?);
            Ok(())
        }
        [scope, action, subaction]
            if scope == "mail" && action == "import" && subaction == "status" =>
        {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("mail.import.status", json!({}), None)?);
            Ok(())
        }
        [scope, action, subaction]
            if scope == "mail" && action == "import" && subaction == "pause" =>
        {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("mail.import.pause", json!({}), None)?);
            Ok(())
        }
        [scope, action, subaction]
            if scope == "mail" && action == "import" && subaction == "resume" =>
        {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("mail.import.resume", json!({}), None)?);
            Ok(())
        }
        [scope, action, subaction]
            if scope == "mail" && action == "import" && subaction == "cancel" =>
        {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("mail.import.cancel", json!({}), None)?);
            Ok(())
        }
        [scope, action] if scope == "mail" && action == "stats" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("mail.index.stats", json!({}), None)?);
            Ok(())
        }
        [scope, action, query] if scope == "mail" && action == "search" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method(
                "mail.index.search",
                json!({ "query": query, "limit": 50, "offset": 0 }),
                None,
            )?);
            Ok(())
        }
        [scope, action, selector, value] if scope == "mail" && action == "open" => {
            let backend = Backend::from_portable_data_dir()?;
            let params = match selector.as_str() {
                "--doc-id" | "doc-id" => {
                    json!({ "docId": value.parse::<u64>().unwrap_or(0) })
                }
                "--message-key" | "message-key" => json!({ "messageKey": value }),
                _ => {
                    let id = selector.parse::<u64>().ok();
                    json!({ "docId": id, "messageKey": selector })
                }
            };
            print_json(&backend.execute_method("mail.index.open", params, None)?);
            Ok(())
        }
        [scope, action, payload] if scope == "upload" && action == "enqueue" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method(
                "upload.queue.enqueue",
                parse_json_arg(payload),
                None,
            )?);
            Ok(())
        }
        [scope, action] if scope == "upload" && action == "list" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("upload.queue.list", json!({}), None)?);
            Ok(())
        }
        [scope, action, task_id] if scope == "upload" && action == "get" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method(
                "upload.queue.get",
                json!({ "taskId": task_id }),
                None,
            )?);
            Ok(())
        }
        [scope, action] if scope == "upload" && action == "run" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("upload.queue.process", json!({}), None)?);
            Ok(())
        }
        [scope, action, task_id] if scope == "upload" && action == "run" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method(
                "upload.queue.process",
                json!({ "taskId": task_id }),
                None,
            )?);
            Ok(())
        }
        [scope, action, task_id]
            if scope == "upload"
                && matches!(action.as_str(), "pause" | "resume" | "cancel" | "retry") =>
        {
            let backend = Backend::from_portable_data_dir()?;
            let method = match action.as_str() {
                "pause" => "upload.queue.pause",
                "resume" => "upload.queue.resume",
                "cancel" => "upload.queue.cancel",
                "retry" => "upload.queue.retry",
                _ => unreachable!(),
            };
            print_json(&backend.execute_method(method, json!({ "taskId": task_id }), None)?);
            Ok(())
        }
        [scope, action] if scope == "upload" && action == "clear-completed" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("upload.queue.clearCompleted", json!({}), None)?);
            Ok(())
        }
        [scope, action, rest @ ..] if scope == "events" && action == "sync" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method(
                "server.events.sync",
                events_sync_params(rest),
                None,
            )?);
            Ok(())
        }
        [scope, action] if scope == "knowledge" && action == "status" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("knowledge.status", json!({}), None)?);
            Ok(())
        }
        [scope, action, rest @ ..] if scope == "knowledge" && action == "sync" => {
            let backend = Backend::from_portable_data_dir()?;
            let params = knowledge_sync_params(rest);
            print_json(&backend.execute_method("knowledge.sync", params, None)?);
            Ok(())
        }
        [scope, action, query @ ..] if scope == "knowledge" && action == "search" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method(
                "knowledge.search",
                json!({ "query": query.join(" "), "limit": 50 }),
                None,
            )?);
            Ok(())
        }
        [scope, action] if scope == "connectors" && action == "list" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("connectors.list", json!({}), None)?);
            Ok(())
        }
        [scope, action, provider_id] if scope == "connectors" && action == "install" => {
            let backend = Backend::from_portable_data_dir()?;
            let params = serde_json::from_str::<Value>(provider_id)
                .map(|manifest| json!({ "manifest": manifest }))
                .unwrap_or_else(|_| {
                    if Path::new(provider_id).exists() {
                        json!({ "packagePath": provider_id })
                    } else {
                        json!({ "providerId": provider_id })
                    }
                });
            print_json(&backend.execute_method("connectors.install", params, None)?);
            Ok(())
        }
        [scope, action, provider_id]
            if scope == "connectors"
                && matches!(action.as_str(), "enable" | "disable" | "uninstall") =>
        {
            let backend = Backend::from_portable_data_dir()?;
            let method = match action.as_str() {
                "enable" => "connectors.enable",
                "disable" => "connectors.disable",
                "uninstall" => "connectors.uninstall",
                _ => unreachable!(),
            };
            print_json(&backend.execute_method(
                method,
                json!({ "providerId": provider_id }),
                None,
            )?);
            Ok(())
        }
        [scope, action, subaction, provider_id, rest @ ..]
            if scope == "connectors"
                && action == "auth"
                && matches!(subaction.as_str(), "start" | "status" | "revoke") =>
        {
            let backend = Backend::from_portable_data_dir()?;
            let mut params = if let Some(raw) = rest.first() {
                serde_json::from_str(raw).unwrap_or_else(|_| json!({}))
            } else {
                json!({})
            };
            params["providerId"] = json!(provider_id);
            let method = match subaction.as_str() {
                "start" => "connectors.auth.start",
                "status" => "connectors.auth.status",
                "revoke" => "connectors.auth.revoke",
                _ => unreachable!(),
            };
            print_json(&backend.execute_method(method, params, None)?);
            Ok(())
        }
        [scope, action, provider_id, rest @ ..] if scope == "connectors" && action == "sync" => {
            let backend = Backend::from_portable_data_dir()?;
            let mut params = if let Some(raw) = rest.first() {
                serde_json::from_str(raw).unwrap_or_else(|_| json!({}))
            } else {
                json!({})
            };
            params["providerId"] = json!(provider_id);
            print_json(&backend.execute_method("connectors.sync", params, None)?);
            Ok(())
        }
        [scope, action, rest @ ..] if scope == "connectors" && action == "health" => {
            let backend = Backend::from_portable_data_dir()?;
            let params = if let Some(provider_id) = rest.first() {
                json!({ "providerId": provider_id })
            } else {
                json!({})
            };
            print_json(&backend.execute_method("connectors.health", params, None)?);
            Ok(())
        }
        [scope, action, query @ ..] if scope == "connectors" && action == "query-local" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method(
                "connectors.queryLocal",
                json!({ "query": query.join(" "), "limit": 50 }),
                None,
            )?);
            Ok(())
        }
        [scope, action, subaction, document_id]
            if scope == "knowledge"
                && action == "document"
                && matches!(subaction.as_str(), "get" | "open") =>
        {
            let backend = Backend::from_portable_data_dir()?;
            let method = if subaction == "open" {
                "knowledge.document.open"
            } else {
                "knowledge.document.get"
            };
            print_json(&backend.execute_method(
                method,
                json!({ "documentId": document_id }),
                None,
            )?);
            Ok(())
        }
        [scope, action, rest @ ..] if scope == "knowledge" && action == "export" => {
            let backend = Backend::from_portable_data_dir()?;
            let params = if rest.is_empty() {
                json!({})
            } else {
                json!({ "documentId": rest[0] })
            };
            print_json(&backend.execute_method("knowledge.export", params, None)?);
            Ok(())
        }
        [scope, action, query @ ..] if scope == "knowledge" && action == "agent-context" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method(
                "knowledge.agent.context",
                json!({ "query": query.join(" ") }),
                None,
            )?);
            Ok(())
        }
        [scope, action, subaction] if scope == "model" && action == "profiles" && subaction == "list" => {
            print_json(&pact_client_native::forwarding::list_model_profiles()?);
            Ok(())
        }
        [scope, action, subaction, rest @ ..]
            if scope == "model" && action == "profiles" && subaction == "set" =>
        {
            let params = cli_params(rest);
            print_json(&pact_client_native::forwarding::save_model_profile(&params)?);
            Ok(())
        }
        [scope, rest @ ..] if scope == "forward" => {
            let params = cli_params(rest);
            print_json(&pact_client_native::forwarding::forward(&params)?);
            Ok(())
        }
        [scope, action, collection] if scope == "state" && action == "get" => {
            print_json(&pact_client_native::client_state::state_get(collection)?);
            Ok(())
        }
        [scope, action, collection, payload] if scope == "state" && action == "set" => {
            print_json(&pact_client_native::client_state::state_set(
                collection,
                parse_json_arg(payload),
            )?);
            Ok(())
        }
        [scope, action, rest @ ..] if scope == "activity" && action == "list" => {
            let params = cli_params(rest);
            print_json(&pact_client_native::client_state::activity_list(&params)?);
            Ok(())
        }
        [scope, action, rest @ ..] if scope == "snapshots" && action == "list" => {
            let params = cli_params(rest);
            print_json(&pact_client_native::client_state::snapshots_list(&params)?);
            Ok(())
        }
        [scope, action, snapshot_id] if scope == "snapshots" && action == "restore" => {
            print_json(&pact_client_native::client_state::snapshots_restore(
                snapshot_id,
            )?);
            Ok(())
        }
        [scope, area, action, rest @ ..]
            if scope == "agents"
                && area == "pair"
                && matches!(action.as_str(), "request" | "approve" | "revoke" | "list") =>
        {
            let params = cli_params(rest);
            let result = match action.as_str() {
                "request" => pact_client_native::skill_hub::pair_request(&params)?,
                "approve" => pact_client_native::skill_hub::pair_approve(&params)?,
                "revoke" => pact_client_native::skill_hub::pair_revoke(&params)?,
                "list" => pact_client_native::skill_hub::pair_list(&params)?,
                _ => unreachable!(),
            };
            print_json(&result);
            Ok(())
        }
        [scope, action, rest @ ..] if scope == "skill" && action == "list" => {
            let params = cli_params(rest);
            print_json(&pact_client_native::skill_hub::skill_list(&params)?);
            Ok(())
        }
        [scope, action, rest @ ..] if scope == "skill" && action == "get" => {
            let params = cli_params(rest);
            print_json(&pact_client_native::skill_hub::skill_get(&params)?);
            Ok(())
        }
        [scope, area, action, rest @ ..]
            if scope == "skill" && area == "visibility" && action == "set" =>
        {
            let params = cli_params(rest);
            print_json(&pact_client_native::skill_hub::skill_visibility(
                &params,
            )?);
            Ok(())
        }
        [scope, area, action, rest @ ..] if scope == "skill" && area == "pin" && action == "set" => {
            let params = cli_params(rest);
            print_json(&pact_client_native::skill_hub::skill_pin(&params)?);
            Ok(())
        }
        [scope, action] if scope == "agents" && action == "list" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("agents.list", json!({}), None)?);
            Ok(())
        }
        [scope, action] if scope == "targets" && action == "scan" => {
            print_json(&pact_client_native::targets::scan_targets()?);
            Ok(())
        }
        [scope, action, rest @ ..] if scope == "targets" && action == "add" => {
            let params = cli_params(rest);
            print_json(&pact_client_native::targets::add_target(&params)?);
            Ok(())
        }
        [scope, action, target] if scope == "targets" && action == "inspect" => {
            print_json(&pact_client_native::targets::inspect_target(target)?);
            Ok(())
        }
        [scope, area, action, rest @ ..]
            if scope == "mcp"
                && area == "plugin"
                && matches!(action.as_str(), "status" | "update" | "rollback") =>
        {
            let params = cli_params(rest);
            let result = match action.as_str() {
                "status" => pact_client_native::mcp_plugins::plugin_status(&params)?,
                "update" => pact_client_native::mcp_plugins::plugin_update(&params)?,
                "rollback" => pact_client_native::mcp_plugins::plugin_rollback(&params)?,
                _ => unreachable!(),
            };
            print_json(&result);
            Ok(())
        }
        [scope, area, action, rest @ ..]
            if scope == "mcp" && area == "config" && action == "plan" =>
        {
            let params = cli_params(rest);
            print_json(&pact_client_native::targets::mcp_config_plan(&params)?);
            Ok(())
        }
        [scope, area, action, rest @ ..]
            if scope == "mcp" && area == "config" && action == "apply" =>
        {
            let params = cli_params(rest);
            print_json(&pact_client_native::targets::mcp_config_apply(&params)?);
            Ok(())
        }
        [scope, area, action, rest @ ..]
            if scope == "mcp" && area == "config" && action == "rollback" =>
        {
            let params = cli_params(rest);
            print_json(&pact_client_native::targets::mcp_config_rollback(&params)?);
            Ok(())
        }
        [scope, action, rest @ ..] if scope == "agents" && action == "sync" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("agents.sync", agent_sync_params(rest), None)?);
            Ok(())
        }
        [scope, area, action]
            if scope == "context" && area == "compaction" && action == "records" =>
        {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("context.compaction.records", json!({}), None)?);
            Ok(())
        }
        [scope, area, action, params]
            if scope == "context"
                && area == "compaction"
                && matches!(action.as_str(), "run" | "preview") =>
        {
            let backend = Backend::from_portable_data_dir()?;
            let params =
                serde_json::from_str(params).unwrap_or_else(|_| json!({ "question": params }));
            let method = if action == "preview" {
                "context.compaction.preview"
            } else {
                "context.compaction.run"
            };
            print_json(&backend.execute_method(method, params, None)?);
            Ok(())
        }
        [scope, area, action]
            if scope == "context" && area == "session-memory" && action == "get" =>
        {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("context.session_memory.get", json!({}), None)?);
            Ok(())
        }
        [scope, area, action, params]
            if scope == "context"
                && area == "session-memory"
                && matches!(action.as_str(), "get" | "clear") =>
        {
            let backend = Backend::from_portable_data_dir()?;
            let params =
                serde_json::from_str(params).unwrap_or_else(|_| json!({ "sessionId": params }));
            let method = if action == "clear" {
                "context.session_memory.clear"
            } else {
                "context.session_memory.get"
            };
            print_json(&backend.execute_method(method, params, None)?);
            Ok(())
        }
        [scope, method] if scope == "rpc" => {
            let backend = Backend::from_portable_data_dir()?;
            let result = backend.execute_method(method, json!({}), None)?;
            print_json(&result);
            Ok(())
        }
        [scope, method, params] if scope == "rpc" => {
            let backend = Backend::from_portable_data_dir()?;
            let params = serde_json::from_str(params).unwrap_or_else(|_| json!({}));
            let result = backend.execute_method(method, params, None)?;
            print_json(&result);
            Ok(())
        }
        [scope, action, task_id] if scope == "task" && action == "cancel" => {
            let backend = Backend::from_portable_data_dir()?;
            backend.request_task_cancel(task_id)?;
            print_json(&json!({ "ok": true, "cancelled": true, "taskId": task_id }));
            Ok(())
        }
        _ => {
            print_usage();
            Ok(())
        }
    }
}

fn print_json(value: &Value) {
    println!(
        "{}",
        serde_json::to_string_pretty(value).unwrap_or_else(|_| "{}".to_string())
    );
}

fn parse_json_arg(value: &str) -> Value {
    serde_json::from_str(value).unwrap_or_else(|_| json!({}))
}

fn cli_params(args: &[String]) -> Value {
    let mut params = serde_json::Map::new();
    let mut positionals = Vec::<Value>::new();
    let mut index = 0;
    while index < args.len() {
        let arg = &args[index];
        if let Some(raw_key) = arg.strip_prefix("--") {
            let key = cli_param_key(raw_key);
            if let Some(value) = args.get(index + 1).filter(|value| !value.starts_with("--")) {
                params.insert(key, json!(value));
                index += 2;
            } else {
                params.insert(key, json!(true));
                index += 1;
            }
            continue;
        }
        positionals.push(json!(arg));
        index += 1;
    }
    if !positionals.is_empty() {
        if !params.contains_key("target") {
            if let Some(target) = positionals.first().and_then(Value::as_str) {
                params.insert("target".to_string(), json!(target));
            }
        }
        params.insert("positionals".to_string(), Value::Array(positionals));
    }
    Value::Object(params)
}

fn cli_param_key(raw: &str) -> String {
    let mut out = String::new();
    let mut uppercase_next = false;
    for ch in raw.chars() {
        if ch == '-' || ch == '_' {
            uppercase_next = true;
            continue;
        }
        if uppercase_next {
            out.extend(ch.to_uppercase());
            uppercase_next = false;
        } else {
            out.push(ch);
        }
    }
    out
}

fn print_usage() {
    eprintln!(
        "Usage:
  pact-client daemon start|status|stop
  pact-client config get|set <json>|patch <json>
  pact-client logs tail|clear
  pact-client files collect <path>
  pact-client files open <path>
  pact-client server api <GET|POST|PUT|DELETE> <path> [json-body] [service-base-url]
  pact-client server <pact-server-cli-args...>
  pact-client vocabulary pull|apply
  pact-client index rebuild
  pact-client mail auth
  pact-client mail import start|status|pause|resume|cancel
  pact-client mail stats
  pact-client mail search <query>
  pact-client mail open --doc-id <id>
  pact-client mail open --message-key <key>
  pact-client upload enqueue <json>
  pact-client upload list|get <task-id>|run [task-id]
  pact-client upload pause|resume|cancel|retry <task-id>
  pact-client upload clear-completed
  pact-client events sync [--service-url URL] [--topic TOPIC] [--cursor N]
  pact-client knowledge status
  pact-client knowledge sync [--push-outbox]
  pact-client knowledge search <query>
  pact-client connectors list
  pact-client connectors install <provider-id-or-manifest-json-or-package-path>
  pact-client connectors enable|disable|uninstall <provider-id>
  pact-client connectors auth start|status|revoke <provider-id> [json]
  pact-client connectors sync <provider-id> [json]
  pact-client connectors health [provider-id]
  pact-client connectors query-local <query>
  pact-client knowledge document get|open <document-id>
  pact-client knowledge export [document-id]
  pact-client knowledge agent-context <query>
  pact-client model profiles list
  pact-client model profiles set <profile-id> [--command CMD|--url URL] [--args JSON] [--api-key KEY]
  pact-client forward --profile <profile-id> --text <input>
  pact-client state get|set <settings|targets|pairings|skills|pins> [json]
  pact-client activity list [--type TYPE] [--target TARGET] [--limit N]
  pact-client snapshots list [--target TARGET]
  pact-client snapshots restore <snapshot-id>
  pact-client agents pair request|approve|revoke|list --agent AGENT [--target TARGET]
  pact-client skill list --agent AGENT
  pact-client skill get <skill-id> --agent AGENT --json
  pact-client skill visibility set <skill-id> --agent AGENT --hidden true|false
  pact-client skill pin set <skill-id> --agent AGENT --version VERSION
  pact-client agents sync [--service-url URL]
  pact-client agents list
  pact-client targets scan
  pact-client targets add --target <target> [--config-path PATH] [--binary-path PATH]
  pact-client targets inspect <target>
  pact-client mcp plugin status|update|rollback --target <target> [--config-path PATH]
  pact-client mcp config plan --target <target> [--config-path PATH]
  pact-client mcp config apply --target <target> [--config-path PATH]
  pact-client mcp config rollback --target <target> [--snapshot-id ID]
  pact-client context compaction run|preview <json-or-question>
  pact-client context compaction records
  pact-client context session-memory get|clear [json-or-session-id]
  pact-client rpc <method> [json-params]
  pact-client task cancel <task-id>"
    );
}

fn knowledge_sync_params(args: &[String]) -> Value {
    let mut params = json!({
        "scope": "mirror",
        "pushOutbox": false
    });
    if args.iter().any(|item| item == "--push-outbox") {
        params["pushOutbox"] = json!(true);
    }
    if let Some(index) = args
        .iter()
        .position(|item| item == "--since" || item == "--cursor")
    {
        if let Some(value) = args.get(index + 1) {
            params["since"] = json!(value);
        }
    }
    params
}

fn events_sync_params(args: &[String]) -> Value {
    let mut params = json!({});
    let mut topics = Vec::<String>::new();
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--service-url" | "--server" | "--server-url" => {
                if let Some(value) = args.get(index + 1) {
                    params["serviceBaseUrl"] = json!(value);
                    index += 2;
                    continue;
                }
            }
            "--cursor" | "--since" => {
                if let Some(value) = args.get(index + 1) {
                    params["cursor"] = json!(value.parse::<u64>().unwrap_or(0));
                    index += 2;
                    continue;
                }
            }
            "--topic" | "--topics" => {
                if let Some(value) = args.get(index + 1) {
                    topics.push(value.to_string());
                    index += 2;
                    continue;
                }
            }
            "--limit" => {
                if let Some(value) = args.get(index + 1) {
                    params["limit"] = json!(value.parse::<u64>().unwrap_or(100));
                    index += 2;
                    continue;
                }
            }
            "--include-snapshot" | "--snapshot" => {
                params["includeSnapshot"] = json!(true);
                index += 1;
                continue;
            }
            _ => {}
        }
        index += 1;
    }
    if !topics.is_empty() {
        params["topics"] = json!(topics);
    }
    params
}

fn agent_sync_params(args: &[String]) -> Value {
    let mut params = json!({});
    if let Some(index) = args
        .iter()
        .position(|item| item == "--service-url" || item == "--server" || item == "--server-url")
    {
        if let Some(value) = args.get(index + 1) {
            params["serviceBaseUrl"] = json!(value);
        }
    }
    params
}
