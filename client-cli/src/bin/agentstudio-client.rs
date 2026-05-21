use anyhow::Result;
use serde_json::{Value, json};
use agentstudio_client_native::backend_core::{Backend, load_rpc_endpoint_from_portable_data};
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
            agentstudio_client_native::backend_core::run_daemon_forever()
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
        [scope, action, query @ ..]
            if scope == "knowledge"
                && matches!(action.as_str(), "agent-context" | "agent-answer") =>
        {
            let backend = Backend::from_portable_data_dir()?;
            let method = if action == "agent-answer" {
                "knowledge.agent.answer"
            } else {
                "knowledge.agent.context"
            };
            let params = if action == "agent-answer" {
                agent_invocation_params(query)
            } else {
                json!({ "query": query.join(" ") })
            };
            print_json(&backend.execute_method(method, params, None)?);
            Ok(())
        }
        [scope, action, query @ ..] if scope == "agent" && action == "invoke" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method(
                "agent.invoke",
                agent_invocation_params(query),
                None,
            )?);
            Ok(())
        }
        [scope, action] if scope == "agents" && action == "list" => {
            let backend = Backend::from_portable_data_dir()?;
            print_json(&backend.execute_method("agents.list", json!({}), None)?);
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

fn print_usage() {
    eprintln!(
        "Usage:
  agentstudio-client daemon start|status|stop
  agentstudio-client config get|set <json>|patch <json>
  agentstudio-client logs tail|clear
  agentstudio-client files collect <path>
  agentstudio-client files open <path>
  agentstudio-client server api <GET|POST|PUT|DELETE> <path> [json-body] [service-base-url]
  agentstudio-client server <agentstudio-server-cli-args...>
  agentstudio-client vocabulary pull|apply
  agentstudio-client index rebuild
  agentstudio-client mail auth
  agentstudio-client mail import start|status|pause|resume|cancel
  agentstudio-client mail stats
  agentstudio-client mail search <query>
  agentstudio-client mail open --doc-id <id>
  agentstudio-client mail open --message-key <key>
  agentstudio-client upload enqueue <json>
  agentstudio-client upload list|get <task-id>|run [task-id]
  agentstudio-client upload pause|resume|cancel|retry <task-id>
  agentstudio-client upload clear-completed
  agentstudio-client events sync [--service-url URL] [--topic TOPIC] [--cursor N]
  agentstudio-client knowledge status
  agentstudio-client knowledge sync [--push-outbox]
  agentstudio-client knowledge search <query>
  agentstudio-client connectors list
  agentstudio-client connectors install <provider-id-or-manifest-json-or-package-path>
  agentstudio-client connectors enable|disable|uninstall <provider-id>
  agentstudio-client connectors auth start|status|revoke <provider-id> [json]
  agentstudio-client connectors sync <provider-id> [json]
  agentstudio-client connectors health [provider-id]
  agentstudio-client connectors query-local <query>
  agentstudio-client knowledge document get|open <document-id>
  agentstudio-client knowledge export [document-id]
  agentstudio-client knowledge agent-context <query>
  agentstudio-client knowledge agent-answer [--url URL] [--token TOKEN] [--alias NAME] [--agent NAME] [--engine ENGINE] <query>
  agentstudio-client agent invoke [--url URL] [--token TOKEN] [--alias NAME] [--agent NAME] [--engine ENGINE] <question>
  agentstudio-client agents sync [--service-url URL]
  agentstudio-client agents list
  agentstudio-client context compaction run|preview <json-or-question>
  agentstudio-client context compaction records
  agentstudio-client context session-memory get|clear [json-or-session-id]
  agentstudio-client rpc <method> [json-params]
  agentstudio-client task cancel <task-id>"
    );
}

fn agent_invocation_params(args: &[String]) -> Value {
    let mut params = json!({});
    let mut question = Vec::new();
    let mut plugins = Vec::<Value>::new();
    let mut parameters = serde_json::Map::new();
    let mut index = 0;
    while index < args.len() {
        let arg = &args[index];
        match arg.as_str() {
            "--url" | "--endpoint" => {
                if let Some(value) = args.get(index + 1) {
                    params["agentEndpointUrl"] = json!(value);
                    index += 2;
                    continue;
                }
            }
            "--token" => {
                if let Some(value) = args.get(index + 1) {
                    params["agentToken"] = json!(value);
                    index += 2;
                    continue;
                }
            }
            "--token-header" => {
                if let Some(value) = args.get(index + 1) {
                    params["agentTokenHeader"] = json!(value);
                    index += 2;
                    continue;
                }
            }
            "--agent" | "--agent-name" => {
                if let Some(value) = args.get(index + 1) {
                    params["agentName"] = json!(value);
                    index += 2;
                    continue;
                }
            }
            "--alias" | "--adapter-alias" => {
                if let Some(value) = args.get(index + 1) {
                    params["agentAlias"] = json!(value);
                    params["customModelAlias"] = json!(value);
                    index += 2;
                    continue;
                }
            }
            "--engine" => {
                if let Some(value) = args.get(index + 1) {
                    params["engine"] = json!(value);
                    index += 2;
                    continue;
                }
            }
            "--session-id" => {
                if let Some(value) = args.get(index + 1) {
                    params["sessionId"] = json!(value);
                    index += 2;
                    continue;
                }
            }
            "--user-id" => {
                if let Some(value) = args.get(index + 1) {
                    params["userId"] = json!(value);
                    index += 2;
                    continue;
                }
            }
            "--project-id" => {
                if let Some(value) = args.get(index + 1) {
                    params["projectId"] = json!(value);
                    index += 2;
                    continue;
                }
            }
            "--plugin" => {
                if let Some(value) = args.get(index + 1) {
                    plugins.push(json!(value));
                    index += 2;
                    continue;
                }
            }
            "--param" => {
                if let Some(value) = args.get(index + 1) {
                    if let Some((key, raw_value)) = value.split_once('=') {
                        let parsed = serde_json::from_str::<Value>(raw_value)
                            .unwrap_or_else(|_| json!(raw_value));
                        parameters.insert(key.to_string(), parsed);
                    }
                    index += 2;
                    continue;
                }
            }
            _ => {}
        }
        question.push(arg.clone());
        index += 1;
    }
    if !plugins.is_empty() {
        params["pluginList"] = json!(plugins);
    }
    if !parameters.is_empty() {
        params["parameters"] = Value::Object(parameters);
    }
    let joined_question = question.join(" ");
    params["question"] = json!(joined_question);
    params["query"] = json!(joined_question);
    params
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
