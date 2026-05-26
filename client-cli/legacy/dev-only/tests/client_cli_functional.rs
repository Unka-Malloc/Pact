use serde_json::{Value, json};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};
use std::thread;
use std::time::{Duration, SystemTime};
use uuid::Uuid;

fn unique_temp_dir(name: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("pact-cli-{}-{}", name, Uuid::new_v4()));
    fs::create_dir_all(&path).unwrap();
    path
}

fn client_bin() -> PathBuf {
    std::env::var_os("CARGO_BIN_EXE_pact-client")
        .map(PathBuf::from)
        .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join("target/debug/pact-client"))
}

fn doc_line(id: u64, subject: &str, sender: &str, mailbox: &str, taxonomy: &str) -> String {
    format!(
        "{}\tm{}\tmail-{}.eml\t{}\t{}\t\t\t\t\t\t{}\tok\t\t\t\t0\t{}",
        id, id, id, subject, sender, mailbox, taxonomy
    )
}

fn write_mail_workspace(dir: &Path) {
    let mail_dir = dir.join("mail-imports");
    let index_dir = mail_dir.join("index");
    fs::create_dir_all(&index_dir).unwrap();
    fs::write(
        mail_dir.join("expert-vocabulary.json"),
        serde_json::to_string_pretty(&json!({
            "schemaVersion": 1,
            "version": 11,
            "updatedAt": "unix:11",
            "publishedAt": "unix:11",
            "source": "cli-functional-test",
            "checksum": "checksum-cli-functional-test",
            "entries": [
                {
                    "id": "contract",
                    "pathSegments": ["专家", "合同"],
                    "label": "合同",
                    "keywords": ["msa", "framework agreement"],
                    "domains": ["legal.example"],
                    "status": "active",
                    "notes": ""
                }
            ]
        }))
        .unwrap(),
    )
    .unwrap();
    fs::write(
        index_dir.join("docs.tsv"),
        format!(
            "{}\n{}\n",
            doc_line(
                1,
                "MSA review",
                "Legal <counsel@legal.example>",
                "Inbox",
                "未分类"
            ),
            doc_line(2, "Internal note", "team@example.com", "Inbox", "未分类")
        ),
    )
    .unwrap();
}

fn run_cli_output(dir: &Path, args: &[&str]) -> Output {
    Command::new(client_bin())
        .env("PACT_PORTABLE_DIR", dir)
        .args(args)
        .output()
        .unwrap()
}

fn run_cli_json(dir: &Path, args: &[&str]) -> Value {
    let output = run_cli_output(dir, args);
    assert!(
        output.status.success(),
        "pact-client {} failed\nstdout:\n{}\nstderr:\n{}",
        args.join(" "),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap_or_else(|error| {
        panic!(
            "pact-client {} did not print JSON: {}\nstdout:\n{}",
            args.join(" "),
            error,
            String::from_utf8_lossy(&output.stdout)
        )
    })
}

fn run_cli_failure(dir: &Path, args: &[&str]) -> Output {
    let output = run_cli_output(dir, args);
    assert!(
        !output.status.success(),
        "pact-client {} unexpectedly succeeded\nstdout:\n{}\nstderr:\n{}",
        args.join(" "),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    output
}

fn wait_for_file(path: &Path, timeout: Duration) {
    let deadline = SystemTime::now() + timeout;
    while SystemTime::now() < deadline {
        if path.exists() {
            return;
        }
        thread::sleep(Duration::from_millis(100));
    }
    panic!("timed out waiting for {}", path.display());
}

fn wait_for_child_exit(child: &mut Child, timeout: Duration) {
    let deadline = SystemTime::now() + timeout;
    while SystemTime::now() < deadline {
        if child.try_wait().unwrap().is_some() {
            return;
        }
        thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
    panic!("daemon did not exit before timeout");
}

fn spawn_vocabulary_server(vocabulary: Value) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = [0_u8; 4096];
        let _ = stream.read(&mut request);
        let request_text = String::from_utf8_lossy(&request);
        assert!(
            request_text.starts_with("GET /api/expert-vocabulary "),
            "unexpected request: {}",
            request_text
        );
        let body = serde_json::to_string(&json!({ "vocabulary": vocabulary })).unwrap();
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
    });
    (url, handle)
}

#[test]
fn cli_prints_usage_for_empty_and_unknown_commands() {
    let dir = unique_temp_dir("usage");

    let empty = run_cli_output(&dir, &[]);
    assert!(empty.status.success());
    assert!(String::from_utf8_lossy(&empty.stderr).contains("Usage:"));

    let unknown = run_cli_output(&dir, &["does-not-exist"]);
    assert!(unknown.status.success());
    assert!(
        String::from_utf8_lossy(&unknown.stderr).contains("pact-client daemon start|status|stop")
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn cli_daemon_start_status_and_stop_are_functional() {
    let dir = unique_temp_dir("daemon-start");
    write_mail_workspace(&dir);
    let mut child = Command::new(client_bin())
        .env("PACT_PORTABLE_DIR", &dir)
        .args(["daemon", "start"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    wait_for_file(
        &dir.join("backend/runtime-state.json"),
        Duration::from_secs(10),
    );
    wait_for_file(&dir.join("backend/rpc.json"), Duration::from_secs(10));

    let status = run_cli_json(&dir, &["daemon", "status"]);
    assert_eq!(status["ok"], true);
    assert_eq!(status["status"], "running");
    assert_eq!(status["runtimeState"]["daemonStatus"], "running");
    assert!(
        status["rpc"]["baseUrl"]
            .as_str()
            .unwrap()
            .starts_with("http://127.0.0.1:")
    );

    let stop = run_cli_json(&dir, &["daemon", "stop"]);
    assert_eq!(stop["ok"], true);
    assert_eq!(stop["status"], "stopping");
    wait_for_child_exit(&mut child, Duration::from_secs(10));

    let stopped: Value =
        serde_json::from_str(&fs::read_to_string(dir.join("backend/runtime-state.json")).unwrap())
            .unwrap();
    assert_eq!(stopped["daemonStatus"], "stopped");
    assert!(!dir.join("backend/rpc.json").exists());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn cli_config_logs_rpc_and_task_commands_return_expected_json() {
    let dir = unique_temp_dir("config-logs-rpc");

    let set_payload = json!({
        "schemaVersion": 1,
        "clientId": "cli-functional",
        "bootstrapBaseUrl": "http://127.0.0.1:8787"
    })
    .to_string();
    let set = run_cli_json(&dir, &["config", "set", &set_payload]);
    assert_eq!(set["clientId"], "cli-functional");

    let patch_payload = json!({
        "resolvedServiceBaseUrl": "http://127.0.0.1:8788",
        "expertVocabularySyncPolicy": "manual"
    })
    .to_string();
    let patched = run_cli_json(&dir, &["config", "patch", &patch_payload]);
    assert_eq!(patched["bootstrapBaseUrl"], "http://127.0.0.1:8787");
    assert_eq!(patched["resolvedServiceBaseUrl"], "http://127.0.0.1:8788");
    assert_eq!(patched["expertVocabularySyncPolicy"], "manual");

    let get = run_cli_json(&dir, &["config", "get"]);
    assert_eq!(get["clientId"], "cli-functional");
    assert_eq!(get["resolvedServiceBaseUrl"], "http://127.0.0.1:8788");

    let append = run_cli_json(&dir, &["rpc", "state.logs.append", r#"{"line":"log-one"}"#]);
    assert_eq!(append["ok"], true);
    let tail = run_cli_json(&dir, &["logs", "tail"]);
    assert_eq!(tail["ok"], true);
    assert_eq!(tail["lines"].as_array().unwrap().last().unwrap(), "log-one");
    let clear = run_cli_json(&dir, &["logs", "clear"]);
    assert_eq!(clear["ok"], true);
    let tail_after_clear = run_cli_json(&dir, &["logs", "tail"]);
    assert!(tail_after_clear["lines"].as_array().unwrap().is_empty());

    let ping = run_cli_json(&dir, &["rpc", "system.ping"]);
    assert_eq!(ping["ok"], true);
    assert_eq!(ping["protocolVersion"], 1);

    let capabilities = run_cli_json(&dir, &["rpc", "system.capabilities"]);
    assert_eq!(capabilities["localRpc"], true);
    assert!(
        capabilities["methods"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item == "mail.index.rebuild")
    );

    let context_payload = json!({
        "sessionId": "cli-context-session",
        "force": true,
        "recentMessageProtectionCount": 1,
        "messages": [
            {
                "id": "cli-context-old",
                "role": "user",
                "content": "必须保留 cli-context-evidence 和 cli-context-risk。".repeat(120)
            },
            {
                "id": "cli-context-current",
                "role": "user",
                "content": "当前问题。"
            }
        ]
    })
    .to_string();
    let context_run = run_cli_json(&dir, &["context", "compaction", "run", &context_payload]);
    assert_eq!(context_run["compacted"], true);
    assert!(
        context_run["summary"]
            .as_str()
            .unwrap()
            .contains("cli-context-evidence")
    );
    let context_records = run_cli_json(&dir, &["context", "compaction", "records"]);
    assert_eq!(context_records["records"].as_array().unwrap().len(), 1);
    let context_memory = run_cli_json(&dir, &["context", "session-memory", "get"]);
    assert_eq!(context_memory["records"].as_array().unwrap().len(), 1);
    let context_cleared = run_cli_json(
        &dir,
        &["context", "session-memory", "clear", "cli-context-session"],
    );
    assert_eq!(context_cleared["ok"], true);

    let events = run_cli_json(
        &dir,
        &["rpc", "events.subscribe", r#"{"offset":0,"timeoutMs":0}"#],
    );
    assert_eq!(events["ok"], true);
    assert!(events["nextOffset"].as_u64().unwrap() >= events["offset"].as_u64().unwrap());

    let cancel = run_cli_json(&dir, &["task", "cancel", "task-123"]);
    assert_eq!(cancel["ok"], true);
    assert_eq!(cancel["cancelled"], true);
    assert_eq!(cancel["taskId"], "task-123");
    assert!(dir.join("backend/cancelled-tasks/task-123.cancel").exists());

    let unknown = run_cli_failure(&dir, &["rpc", "unknown.method"]);
    assert!(String::from_utf8_lossy(&unknown.stderr).contains("unknown method: unknown.method"));

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn cli_files_and_server_commands_are_covered() {
    let dir = unique_temp_dir("files-server");
    let fixtures = dir.join("fixtures");
    fs::create_dir_all(&fixtures).unwrap();
    fs::write(fixtures.join("note.txt"), "hello").unwrap();
    fs::write(fixtures.join("message.eml"), "Subject: Hello\n\nBody").unwrap();
    fs::write(fixtures.join("ignored.bin"), [1_u8, 2, 3]).unwrap();

    let collected = run_cli_json(&dir, &["files", "collect", fixtures.to_str().unwrap()]);
    assert_eq!(collected["ok"], true);
    let names = collected["files"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|item| item["name"].as_str())
        .collect::<Vec<_>>();
    assert!(names.contains(&"note.txt"));
    assert!(names.contains(&"message.eml"));
    assert!(!names.contains(&"ignored.bin"));

    if !cfg!(target_os = "macos") {
        let opened = run_cli_json(
            &dir,
            &["files", "open", fixtures.join("note.txt").to_str().unwrap()],
        );
        assert_eq!(opened["ok"], true);
        assert_eq!(opened["opened"], false);
    }

    if Command::new("node")
        .arg("--version")
        .output()
        .map(|item| item.status.success())
        .unwrap_or(false)
    {
        let server_help = run_cli_json(&dir, &["server", "--help"]);
        assert_eq!(server_help["ok"], true);
        assert!(
            server_help["stdout"]
                .as_str()
                .unwrap()
                .contains("pact --file")
        );
    }

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn cli_upload_queue_commands_are_event_sourced() {
    let dir = unique_temp_dir("upload-queue");
    let fixture = dir.join("queued.txt");
    fs::write(&fixture, "queued upload").unwrap();
    let payload = json!({
        "taskId": "cli-upload-task",
        "serviceBaseUrl": "http://127.0.0.1:9",
        "files": [
            {
                "path": fixture.to_string_lossy().to_string(),
                "relativePath": "queued.txt",
                "name": "queued.txt",
                "mediaType": "text/plain"
            }
        ],
        "startPaused": true
    })
    .to_string();

    let enqueued = run_cli_json(&dir, &["upload", "enqueue", &payload]);
    assert_eq!(enqueued["taskId"], "cli-upload-task");
    assert_eq!(enqueued["task"]["status"], "paused");
    assert!(dir.join("backend/upload-queue/events.jsonl").exists());

    let listed = run_cli_json(&dir, &["upload", "list"]);
    assert_eq!(listed["state"]["tasks"].as_array().unwrap().len(), 1);

    let resumed = run_cli_json(&dir, &["upload", "resume", "cli-upload-task"]);
    assert_eq!(resumed["task"]["status"], "queued");

    let paused = run_cli_json(&dir, &["upload", "pause", "cli-upload-task"]);
    assert_eq!(paused["task"]["status"], "paused");

    let cancelled = run_cli_json(&dir, &["upload", "cancel", "cli-upload-task"]);
    assert_eq!(cancelled["task"]["status"], "cancelled");

    let cleared = run_cli_json(&dir, &["upload", "clear-completed"]);
    assert!(cleared["state"]["tasks"].as_array().unwrap().is_empty());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn cli_data_connectors_manage_chat_mirror_and_local_query() {
    let dir = unique_temp_dir("data-connectors");

    let listed = run_cli_json(&dir, &["connectors", "list"]);
    assert_eq!(listed["ok"], true);
    assert!(
        listed["chatDatabasePath"]
            .as_str()
            .unwrap()
            .ends_with("chat-index/chat.sqlite")
    );
    assert!(
        listed["connectors"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| { item["providerId"] == "slack" && item["sourceType"] == "chat" })
    );

    let installed = run_cli_json(&dir, &["connectors", "install", "slack"]);
    assert_eq!(installed["ok"], true);
    assert_eq!(installed["connector"]["providerId"], "slack");
    assert_eq!(installed["connector"]["installed"], true);

    let enabled = run_cli_json(&dir, &["connectors", "enable", "slack"]);
    assert_eq!(enabled["connector"]["enabled"], true);

    let auth = run_cli_json(
        &dir,
        &[
            "connectors",
            "auth",
            "start",
            "slack",
            r#"{"accountHint":"ops@example.test","mockToken":"token"}"#,
        ],
    );
    assert_eq!(auth["auth"]["status"], "connected");

    let sync_payload = json!({
        "syncBatchId": "client-batch-2026-03",
        "messages": [
            {
                "externalId": "slack-message-bill-1",
                "workspaceId": "workspace-a",
                "workspaceName": "Ops Workspace",
                "conversationId": "billing",
                "conversationTitle": "Billing",
                "senderId": "u-1",
                "senderName": "Alice",
                "text": "3 月账单已经上传到网盘，文件名是 invoice-march.pdf。",
                "timestamp": "2026-03-18T09:00:00Z"
            }
        ]
    })
    .to_string();
    let synced = run_cli_json(&dir, &["connectors", "sync", "slack", &sync_payload]);
    assert_eq!(synced["ok"], true);
    assert_eq!(synced["syncBatchId"], "client-batch-2026-03");
    assert_eq!(synced["itemCount"], 1);

    let queried = run_cli_json(&dir, &["connectors", "query-local", "3 月账单"]);
    assert_eq!(queried["ok"], true);
    assert_eq!(queried["items"][0]["sourceType"], "chat");
    assert_eq!(queried["items"][0]["providerId"], "slack");
    assert_eq!(
        queried["items"][0]["chatRef"]["syncBatchId"],
        "client-batch-2026-03"
    );

    let health = run_cli_json(&dir, &["connectors", "health", "slack"]);
    assert_eq!(health["items"][0]["chatMessageCount"], 1);

    let _ = fs::remove_dir_all(dir);
}

#[test]
#[cfg(unix)]
fn cli_external_data_connector_package_lifecycle_invokes_process_runtime() {
    let dir = unique_temp_dir("external-data-connector");
    let package_dir = dir.join("acme-connector-package");
    fs::create_dir_all(&package_dir).unwrap();
    fs::write(
        package_dir.join("connector.json"),
        serde_json::to_string_pretty(&json!({
            "schemaVersion": 1,
            "id": "acme-files",
            "providerId": "acme-files",
            "sourceType": "file",
            "displayName": "ACME Files",
            "version": "1.0.0",
            "entrypoint": "process:connector.sh",
            "runtime": {
                "kind": "process",
                "command": "connector.sh",
                "protocol": "stdio-json-v1"
            },
            "permissions": ["source:file", "local-mirror:write", "local-query:read"],
            "capabilities": ["sync", "localQuery", "health", "uninstall"],
            "oauth": { "type": "none" },
            "syncPolicy": {
                "mode": "incremental-local-mirror",
                "realTimeFederatedSearch": false
            },
            "uninstallPolicy": {
                "retainIngestedKnowledge": true,
                "removeLocalMirror": true,
                "removeModuleOnUninstall": true
            }
        }))
        .unwrap(),
    )
    .unwrap();
    let script = package_dir.join("connector.sh");
    fs::write(
        &script,
        r#"#!/bin/sh
cat >/dev/null
case "$PACT_CONNECTOR_OPERATION" in
  sync)
    printf '%s\n' '{"ok":true,"items":[{"externalId":"acme-invoice-1","title":"ACME 3 月账单","snippet":"3 月账单来自外部连接器。","timestamp":"2026-03-18T12:00:00Z","score":0.91}]}'
    ;;
  localQuery)
    printf '%s\n' '{"ok":true,"items":[{"externalId":"acme-local-1","title":"ACME 本地 mirror 账单","snippet":"3 月账单本地 mirror 命中。","timestamp":"2026-03-18T13:00:00Z","score":0.93}]}'
    ;;
  health)
    printf '%s\n' '{"ok":true,"status":"healthy","runtime":"process"}'
    ;;
  uninstall)
    mkdir -p "$PACT_CONNECTOR_CACHE_DIR"
    : > "$PACT_CONNECTOR_CACHE_DIR/uninstalled.flag"
    printf '%s\n' '{"ok":true,"status":"uninstalled"}'
    ;;
  *)
    printf '%s\n' '{"ok":true}'
    ;;
esac
"#,
    )
    .unwrap();
    let mut permissions = fs::metadata(&script).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&script, permissions).unwrap();

    let installed = run_cli_json(
        &dir,
        &[
            "connectors",
            "install",
            package_dir.to_str().expect("utf8 package path"),
        ],
    );
    assert_eq!(installed["ok"], true);
    assert_eq!(installed["connector"]["providerId"], "acme-files");
    assert_eq!(installed["connector"]["runtime"]["kind"], "process");
    assert_eq!(installed["connector"]["installed"], true);

    let enabled = run_cli_json(&dir, &["connectors", "enable", "acme-files"]);
    assert_eq!(enabled["connector"]["enabled"], true);

    let synced = run_cli_json(
        &dir,
        &[
            "connectors",
            "sync",
            "acme-files",
            r#"{"syncBatchId":"client-batch-ext"}"#,
        ],
    );
    assert_eq!(synced["ok"], true);
    assert_eq!(synced["runtime"]["kind"], "process");
    assert_eq!(synced["itemCount"], 1);

    let queried = run_cli_json(&dir, &["connectors", "query-local", "3 月账单"]);
    let items = queried["items"].as_array().unwrap();
    assert!(items.iter().any(|item| {
        item["providerId"] == "acme-files" && item["runtime"]["kind"] == "process"
    }));

    let health = run_cli_json(&dir, &["connectors", "health", "acme-files"]);
    assert_eq!(health["items"][0]["runtime"]["kind"], "process");
    assert_eq!(health["items"][0]["runtimeHealth"]["status"], "healthy");

    let uninstalled = run_cli_json(&dir, &["connectors", "uninstall", "acme-files"]);
    assert_eq!(uninstalled["ok"], true);
    assert_eq!(uninstalled["removedCache"], true);
    assert_eq!(uninstalled["removedModule"], true);
    assert!(!dir.join("connectors/modules/acme-files").exists());

    let listed = run_cli_json(&dir, &["connectors", "list"]);
    assert!(
        !listed["connectors"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| { item["providerId"] == "acme-files" })
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn cli_vocabulary_index_and_mail_commands_update_local_index() {
    let dir = unique_temp_dir("vocabulary-index-mail");
    write_mail_workspace(&dir);

    let stats = run_cli_json(&dir, &["mail", "stats"]);
    assert_eq!(stats["documentCount"], 2);

    let rebuild = run_cli_json(&dir, &["index", "rebuild"]);
    assert_eq!(rebuild["documentCount"], 2);
    assert_eq!(rebuild["updatedDocumentCount"], 1);

    let search = run_cli_json(&dir, &["mail", "search", "msa"]);
    assert_eq!(search["total"], 1);
    assert_eq!(search["results"][0]["taxonomyPath"], "专家/合同");

    let apply = run_cli_json(&dir, &["vocabulary", "apply"]);
    assert_eq!(apply["documentCount"], 2);
    assert_eq!(apply["updatedDocumentCount"], 0);

    if !cfg!(target_os = "macos") {
        let opened_by_id = run_cli_json(&dir, &["mail", "open", "--doc-id", "1"]);
        assert_eq!(opened_by_id["opened"], false);
        assert_eq!(opened_by_id["docId"], 1);

        let opened_by_key = run_cli_json(&dir, &["mail", "open", "--message-key", "m1"]);
        assert_eq!(opened_by_key["opened"], false);
        assert_eq!(opened_by_key["messageKey"], "m1");
    }

    let import_status = run_cli_json(&dir, &["mail", "import", "status"]);
    assert_eq!(import_status["running"], false);
    assert_eq!(import_status["status"], "idle");

    let paused = run_cli_json(&dir, &["mail", "import", "pause"]);
    assert_eq!(paused["paused"], true);
    let resumed = run_cli_json(&dir, &["mail", "import", "resume"]);
    assert_eq!(resumed["paused"], false);
    let cancelled = run_cli_json(&dir, &["mail", "import", "cancel"]);
    assert_eq!(cancelled["cancelRequested"], true);

    if !cfg!(target_os = "macos") {
        let auth = run_cli_failure(&dir, &["mail", "auth"]);
        assert!(
            String::from_utf8_lossy(&auth.stderr).contains("macOS Mail helper is only available")
        );
        let start = run_cli_failure(&dir, &["mail", "import", "start"]);
        assert!(
            String::from_utf8_lossy(&start.stderr).contains("macOS Mail import is only available")
        );
    }

    let server_vocabulary = json!({
        "schemaVersion": 1,
        "version": 22,
        "updatedAt": "unix:22",
        "publishedAt": "unix:22",
        "source": "local-test-server",
        "checksum": "checksum-local-test-server",
        "entries": [
            {
                "id": "master-service-agreement",
                "pathSegments": ["专家", "主协议"],
                "label": "主协议",
                "keywords": ["msa"],
                "domains": ["legal.example"],
                "status": "active",
                "notes": ""
            }
        ]
    });
    let (base_url, server_handle) = spawn_vocabulary_server(server_vocabulary);
    let config_payload = json!({
        "bootstrapBaseUrl": base_url,
        "resolvedServiceBaseUrl": base_url,
        "expertVocabularySyncPolicy": "manual"
    })
    .to_string();
    let _ = run_cli_json(&dir, &["config", "patch", &config_payload]);
    let pulled = run_cli_json(&dir, &["vocabulary", "pull"]);
    server_handle.join().unwrap();
    assert_eq!(pulled["changed"], true);
    assert_eq!(pulled["vocabulary"]["version"], 22);
    assert_eq!(pulled["applyResult"]["updatedDocumentCount"], 1);

    let search_after_pull = run_cli_json(&dir, &["mail", "search", "msa"]);
    assert_eq!(
        search_after_pull["results"][0]["taxonomyPath"],
        "专家/主协议"
    );

    let _ = fs::remove_dir_all(dir);
}
