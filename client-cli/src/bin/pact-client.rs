use anyhow::Result;
use serde_json::{Value, json};
use std::env;

fn main() -> Result<()> {
    env_logger::init();
    let args = env::args().skip(1).collect::<Vec<_>>();
    if args.is_empty()
        || matches!(
            args.first().map(String::as_str),
            Some("--help" | "-h" | "help")
        )
    {
        print_usage();
        return Ok(());
    }

    match args.as_slice() {
        [scope, action, subaction]
            if scope == "model" && action == "profiles" && subaction == "list" =>
        {
            print_json(&pact_client_native::forwarding::list_model_profiles()?);
            Ok(())
        }
        [scope, action, subaction, rest @ ..]
            if scope == "model" && action == "profiles" && subaction == "set" =>
        {
            let params = cli_params(rest);
            print_json(&pact_client_native::forwarding::save_model_profile(
                &params,
            )?);
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
            print_json(&pact_client_native::skill_hub::skill_visibility(&params)?);
            Ok(())
        }
        [scope, area, action, rest @ ..]
            if scope == "skill" && area == "pin" && action == "set" =>
        {
            let params = cli_params(rest);
            print_json(&pact_client_native::skill_hub::skill_pin(&params)?);
            Ok(())
        }
        [scope, action, rest @ ..] if scope == "targets" && action == "scan" => {
            let params = cli_params(rest);
            print_json(&pact_client_native::targets::scan_targets_with_params(
                &params,
            )?);
            Ok(())
        }
        [scope, action, rest @ ..] if scope == "targets" && action == "add" => {
            let params = cli_params(rest);
            print_json(&pact_client_native::targets::add_target(&params)?);
            Ok(())
        }
        [scope, action, target, rest @ ..] if scope == "targets" && action == "inspect" => {
            let mut params = cli_params(rest);
            if let Some(object) = params.as_object_mut() {
                object.insert("target".to_string(), json!(target));
            }
            print_json(&pact_client_native::targets::inspect_target_with_params(
                &params,
            )?);
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
            if scope == "mcp"
                && area == "config"
                && matches!(action.as_str(), "plan" | "apply" | "rollback") =>
        {
            let params = cli_params(rest);
            let result = match action.as_str() {
                "plan" => pact_client_native::targets::mcp_config_plan(&params)?,
                "apply" => pact_client_native::targets::mcp_config_apply(&params)?,
                "rollback" => pact_client_native::targets::mcp_config_rollback(&params)?,
                _ => unreachable!(),
            };
            print_json(&result);
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
  pact-client targets scan [--state-root PATH]
  pact-client targets add --target <target> [--config-path PATH] [--binary-path PATH] [--state-root PATH]
  pact-client targets inspect <target> [--state-root PATH]
  pact-client mcp plugin status|update|rollback --target <target> [--config-path PATH] [--state-root PATH]
  pact-client mcp config plan --target <target> [--config-path PATH] [--state-root PATH]
  pact-client mcp config apply --target <target> [--config-path PATH] [--state-root PATH]
  pact-client mcp config rollback --target <target> [--snapshot-id ID] [--state-root PATH]"
    );
}
