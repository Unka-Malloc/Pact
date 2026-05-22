use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, SystemTime};
use uuid::Uuid;

fn unique_temp_dir(name: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("pact-it-{}-{}", name, Uuid::new_v4()));
    fs::create_dir_all(&path).unwrap();
    path
}

fn clientd_bin() -> PathBuf {
    std::env::var_os("CARGO_BIN_EXE_pact-clientd")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR")).join("target/debug/pact-clientd")
        })
}

fn client_bin() -> PathBuf {
    std::env::var_os("CARGO_BIN_EXE_pact-client")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR")).join("target/debug/pact-client")
        })
}

fn doc_line(id: u64, subject: &str, sender: &str, mailbox: &str, taxonomy: &str) -> String {
    format!(
        "{}\tm{}\tmail-{}.eml\t{}\t{}\t\t\t\t\t\t{}\tok\t\t\t\t0\t{}",
        id, id, id, subject, sender, mailbox, taxonomy
    )
}

fn write_workspace(dir: &Path) {
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
            "source": "integration-test",
            "checksum": "checksum-it",
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

fn wait_for_command_result(dir: &Path, command_id: &str) -> Value {
    let path = dir
        .join("backend")
        .join("command-results")
        .join(format!("{}.json", command_id));
    wait_for_file(&path, Duration::from_secs(10));
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

fn start_daemon(dir: &Path) -> Child {
    let child = Command::new(clientd_bin())
        .env("PACT_PORTABLE_DIR", dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    wait_for_file(
        &dir.join("backend").join("runtime-state.json"),
        Duration::from_secs(10),
    );
    wait_for_file(
        &dir.join("backend").join("rpc.json"),
        Duration::from_secs(10),
    );
    child
}

fn stop_daemon(dir: &Path, child: &mut Child) {
    let _ = Command::new(client_bin())
        .env("PACT_PORTABLE_DIR", dir)
        .args(["daemon", "stop"])
        .output();
    for _ in 0..50 {
        if child.try_wait().unwrap().is_some() {
            return;
        }
        thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
}

#[test]
fn daemon_processes_workspace_command_file_and_updates_index() {
    let dir = unique_temp_dir("daemon-command");
    write_workspace(&dir);
    let mut child = start_daemon(&dir);

    let command_id = "it-rebuild";
    let inbox = dir.join("backend").join("commands").join("inbox");
    fs::create_dir_all(&inbox).unwrap();
    fs::write(
        inbox.join(format!("{}.json", command_id)),
        serde_json::to_string_pretty(&json!({
            "schemaVersion": 1,
            "protocolVersion": 1,
            "commandId": command_id,
            "method": "mail.index.rebuild",
            "params": {},
            "createdAt": "unix:1"
        }))
        .unwrap(),
    )
    .unwrap();

    let result = wait_for_command_result(&dir, command_id);
    assert_eq!(result["status"], "completed");
    assert_eq!(result["result"]["documentCount"], 2);
    assert_eq!(result["result"]["updatedDocumentCount"], 1);
    assert!(
        fs::read_to_string(dir.join("mail-imports/index/docs.tsv"))
            .unwrap()
            .contains("专家/合同")
    );

    stop_daemon(&dir, &mut child);
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn cli_direct_rebuild_and_search_do_not_require_daemon() {
    let dir = unique_temp_dir("cli-direct");
    write_workspace(&dir);

    let rebuild = Command::new(client_bin())
        .env("PACT_PORTABLE_DIR", &dir)
        .args(["index", "rebuild"])
        .output()
        .unwrap();
    assert!(
        rebuild.status.success(),
        "{}",
        String::from_utf8_lossy(&rebuild.stderr)
    );
    let rebuild_json: Value = serde_json::from_slice(&rebuild.stdout).unwrap();
    assert_eq!(rebuild_json["documentCount"], 2);
    assert_eq!(rebuild_json["updatedDocumentCount"], 1);

    let search = Command::new(client_bin())
        .env("PACT_PORTABLE_DIR", &dir)
        .args(["mail", "search", "msa"])
        .output()
        .unwrap();
    assert!(
        search.status.success(),
        "{}",
        String::from_utf8_lossy(&search.stderr)
    );
    let search_json: Value = serde_json::from_slice(&search.stdout).unwrap();
    assert_eq!(search_json["total"], 1);
    assert_eq!(search_json["results"][0]["taxonomyPath"], "专家/合同");

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn daemon_status_and_stop_use_shared_workspace() {
    let dir = unique_temp_dir("daemon-status");
    write_workspace(&dir);
    let mut child = start_daemon(&dir);

    let status = Command::new(client_bin())
        .env("PACT_PORTABLE_DIR", &dir)
        .args(["daemon", "status"])
        .output()
        .unwrap();
    assert!(
        status.status.success(),
        "{}",
        String::from_utf8_lossy(&status.stderr)
    );
    let status_json: Value = serde_json::from_slice(&status.stdout).unwrap();
    assert_eq!(status_json["ok"], true);
    assert_eq!(status_json["status"], "running");
    assert!(
        status_json["rpc"]["baseUrl"]
            .as_str()
            .unwrap()
            .starts_with("http://127.0.0.1:")
    );

    stop_daemon(&dir, &mut child);
    let stopped: Value =
        serde_json::from_str(&fs::read_to_string(dir.join("backend/runtime-state.json")).unwrap())
            .unwrap();
    assert_eq!(stopped["daemonStatus"], "stopped");
    assert!(!dir.join("backend/rpc.json").exists());

    let _ = fs::remove_dir_all(dir);
}
