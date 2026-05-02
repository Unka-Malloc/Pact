use anyhow::Result;
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const UPLOAD_QUEUE_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct UploadQueueFile {
    pub path: String,
    pub name: String,
    pub relative_path: String,
    pub media_type: String,
    pub sha256: String,
    pub byte_size: u64,
    pub received_bytes: u64,
    pub status: String,
    pub error: String,
    pub completed_at: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct UploadQueueTask {
    pub task_id: String,
    pub status: String,
    pub service_base_url: String,
    pub input_text: String,
    pub settings: Value,
    pub checkpoint_id: String,
    pub manifest_digest: String,
    pub input_digest: String,
    pub summary: String,
    pub files: Vec<UploadQueueFile>,
    pub attempts: u64,
    pub progress: f64,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: String,
    pub finished_at: String,
    pub error: String,
    pub recoverable: bool,
    pub failure_kind: String,
    pub retry_after_epoch_ms: u64,
    pub retry_after_at: String,
    pub knowledge_status: String,
    pub knowledge_error: String,
    pub knowledge_synced_at: String,
    pub job: Value,
    pub result: Value,
    pub upload_session: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadQueueEvent {
    pub schema_version: u32,
    pub event_id: String,
    pub offset: u64,
    #[serde(rename = "type")]
    pub event_type: String,
    pub created_at: String,
    pub payload: Value,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct UploadQueueState {
    pub schema_version: u32,
    pub event_count: usize,
    pub next_offset: u64,
    pub active_task_id: String,
    pub updated_at: String,
    pub tasks: Vec<UploadQueueTask>,
}

pub fn queue_dir(backend_dir: &Path) -> PathBuf {
    backend_dir.join("upload-queue")
}

pub fn events_path(queue_dir: &Path) -> PathBuf {
    queue_dir.join("events.jsonl")
}

pub fn append_event(
    queue_dir: &Path,
    event_type: &str,
    payload: Value,
    created_at: String,
) -> Result<UploadQueueEvent> {
    fs::create_dir_all(queue_dir)?;
    let lock_path = queue_dir.join("events.lock");
    let lock = OpenOptions::new()
        .create(true)
        .write(true)
        .open(lock_path)?;
    lock.lock_exclusive()?;
    let result = (|| -> Result<UploadQueueEvent> {
        let path = events_path(queue_dir);
        let offset = fs::metadata(&path).map(|item| item.len()).unwrap_or(0);
        let event = UploadQueueEvent {
            schema_version: UPLOAD_QUEUE_SCHEMA_VERSION,
            event_id: Uuid::new_v4().to_string(),
            offset,
            event_type: event_type.to_string(),
            created_at,
            payload,
        };
        let mut file = OpenOptions::new().create(true).append(true).open(path)?;
        writeln!(file, "{}", serde_json::to_string(&event)?)?;
        Ok(event)
    })();
    let _ = lock.unlock();
    result
}

pub fn read_events(queue_dir: &Path, offset: u64) -> Result<(Vec<UploadQueueEvent>, u64)> {
    let path = events_path(queue_dir);
    if !path.exists() {
        return Ok((Vec::new(), 0));
    }
    let mut file = OpenOptions::new().read(true).open(path)?;
    let len = file.metadata()?.len();
    let start = offset.min(len);
    file.seek(SeekFrom::Start(start))?;
    let mut raw = String::new();
    file.read_to_string(&mut raw)?;
    let events = raw
        .lines()
        .filter_map(|line| serde_json::from_str::<UploadQueueEvent>(line).ok())
        .collect::<Vec<_>>();
    Ok((events, len))
}

pub fn load_state(queue_dir: &Path) -> Result<UploadQueueState> {
    let (events, next_offset) = read_events(queue_dir, 0)?;
    Ok(project_events(&events, next_offset))
}

pub fn project_events(events: &[UploadQueueEvent], next_offset: u64) -> UploadQueueState {
    let mut state = UploadQueueState {
        schema_version: UPLOAD_QUEUE_SCHEMA_VERSION,
        event_count: events.len(),
        next_offset,
        ..UploadQueueState::default()
    };
    for event in events {
        apply_event(&mut state, event);
    }
    for task in &mut state.tasks {
        recompute_task_progress(task);
    }
    state.active_task_id = state
        .tasks
        .iter()
        .find(|task| task.status == "running")
        .map(|task| task.task_id.clone())
        .unwrap_or_default();
    state
}

pub fn first_queued_task(state: &UploadQueueState) -> Option<UploadQueueTask> {
    state
        .tasks
        .iter()
        .find(|task| task.status == "queued")
        .cloned()
}

pub fn next_processable_task(
    state: &UploadQueueState,
    now_epoch_ms: u64,
) -> Option<UploadQueueTask> {
    state
        .tasks
        .iter()
        .find(|task| is_processable_task(task, now_epoch_ms))
        .cloned()
}

pub fn processable_task_by_id(
    state: &UploadQueueState,
    task_id: &str,
    now_epoch_ms: u64,
) -> Option<UploadQueueTask> {
    state
        .tasks
        .iter()
        .find(|task| task.task_id == task_id && is_processable_task(task, now_epoch_ms))
        .cloned()
}

pub fn has_processable_task(state: &UploadQueueState, now_epoch_ms: u64) -> bool {
    state
        .tasks
        .iter()
        .any(|task| is_processable_task(task, now_epoch_ms))
}

pub fn task_by_id(state: &UploadQueueState, task_id: &str) -> Option<UploadQueueTask> {
    state
        .tasks
        .iter()
        .find(|task| task.task_id == task_id)
        .cloned()
}

pub fn is_terminal_status(status: &str) -> bool {
    matches!(status, "completed" | "failed" | "cancelled")
}

fn is_processable_task(task: &UploadQueueTask, now_epoch_ms: u64) -> bool {
    match task.status.as_str() {
        "queued" => true,
        "waiting_server" => {
            task.retry_after_epoch_ms == 0 || task.retry_after_epoch_ms <= now_epoch_ms
        }
        _ => false,
    }
}

fn apply_event(state: &mut UploadQueueState, event: &UploadQueueEvent) {
    state.updated_at = event.created_at.clone();
    match event.event_type.as_str() {
        "upload.queue.enqueued" => {
            if let Some(task) = event
                .payload
                .get("task")
                .and_then(|value| serde_json::from_value::<UploadQueueTask>(value.clone()).ok())
            {
                upsert_task(state, task);
            }
        }
        "upload.queue.started" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                task.status = "running".to_string();
                task.error.clear();
                task.attempts = event
                    .payload
                    .get("attempt")
                    .and_then(Value::as_u64)
                    .unwrap_or(task.attempts.max(1));
                task.recoverable = false;
                task.failure_kind.clear();
                task.retry_after_epoch_ms = 0;
                task.retry_after_at.clear();
                task.started_at = event.created_at.clone();
                task.finished_at.clear();
                task.updated_at = event.created_at.clone();
            }
        }
        "upload.queue.paused" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                if !is_terminal_status(&task.status) {
                    task.status = "paused".to_string();
                    task.updated_at = event.created_at.clone();
                    task.error = string_field(&event.payload, "reason");
                }
            }
        }
        "upload.queue.resumed" | "upload.queue.retried" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                if task.status != "completed" {
                    task.status = "queued".to_string();
                    task.error.clear();
                    task.recoverable = false;
                    task.failure_kind.clear();
                    task.retry_after_epoch_ms = 0;
                    task.retry_after_at.clear();
                    task.finished_at.clear();
                    task.updated_at = event.created_at.clone();
                }
            }
        }
        "upload.queue.deferred" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                if !matches!(task.status.as_str(), "completed" | "cancelled" | "paused") {
                    task.status = "waiting_server".to_string();
                    task.error = string_field(&event.payload, "error");
                    task.recoverable = true;
                    task.failure_kind = string_field(&event.payload, "failureKind");
                    task.retry_after_epoch_ms = event
                        .payload
                        .get("retryAfterEpochMs")
                        .and_then(Value::as_u64)
                        .unwrap_or(0);
                    task.retry_after_at = string_field(&event.payload, "retryAfterAt");
                    task.finished_at.clear();
                    task.updated_at = event.created_at.clone();
                }
            }
        }
        "upload.queue.cancelled" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                if task.status != "completed" {
                    task.status = "cancelled".to_string();
                    task.error = string_field(&event.payload, "reason");
                    task.recoverable = false;
                    task.failure_kind.clear();
                    task.retry_after_epoch_ms = 0;
                    task.retry_after_at.clear();
                    task.finished_at = event.created_at.clone();
                    task.updated_at = event.created_at.clone();
                }
            }
        }
        "upload.queue.failed" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                task.status = "failed".to_string();
                task.error = string_field(&event.payload, "error");
                task.recoverable = false;
                task.failure_kind = string_field(&event.payload, "failureKind");
                task.retry_after_epoch_ms = 0;
                task.retry_after_at.clear();
                task.finished_at = event.created_at.clone();
                task.updated_at = event.created_at.clone();
            }
        }
        "upload.queue.completed" | "upload.queue.job.completed" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                task.status = "completed".to_string();
                task.progress = 1.0;
                task.error.clear();
                task.recoverable = false;
                task.failure_kind.clear();
                task.retry_after_epoch_ms = 0;
                task.retry_after_at.clear();
                if task.knowledge_status.trim().is_empty() {
                    task.knowledge_status = "pending".to_string();
                }
                task.finished_at = event.created_at.clone();
                task.updated_at = event.created_at.clone();
                if let Some(job) = event.payload.get("job") {
                    task.job = job.clone();
                }
                if let Some(result) = event.payload.get("result") {
                    task.result = result.clone();
                }
                if let Some(session) = event.payload.get("uploadSession") {
                    task.upload_session = session.clone();
                    apply_session_to_task(task, session);
                }
            }
        }
        "upload.queue.session.created" | "upload.queue.session.updated" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                if let Some(session) = event.payload.get("session") {
                    task.upload_session = session.clone();
                    apply_session_to_task(task, session);
                }
                task.updated_at = event.created_at.clone();
            }
        }
        "upload.queue.session.realigned" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                if let Some(session) = event.payload.get("session") {
                    task.upload_session = session.clone();
                    apply_session_to_task(task, session);
                }
                if let Some(file) = find_file_mut(task, &relative_path(&event.payload)) {
                    file.received_bytes = event
                        .payload
                        .get("expectedOffset")
                        .and_then(Value::as_u64)
                        .unwrap_or(file.received_bytes);
                    file.status = "uploading".to_string();
                }
                task.updated_at = event.created_at.clone();
            }
        }
        "upload.queue.file.started" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                if let Some(file) = find_file_mut(task, &relative_path(&event.payload)) {
                    file.status = "uploading".to_string();
                    file.error.clear();
                }
                task.updated_at = event.created_at.clone();
            }
        }
        "upload.queue.file.progress" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                if let Some(file) = find_file_mut(task, &relative_path(&event.payload)) {
                    file.received_bytes = event
                        .payload
                        .get("receivedBytes")
                        .and_then(Value::as_u64)
                        .unwrap_or(file.received_bytes)
                        .min(file.byte_size);
                    file.status = if file.byte_size > 0 && file.received_bytes >= file.byte_size {
                        "completed".to_string()
                    } else {
                        "uploading".to_string()
                    };
                    if file.status == "completed" {
                        file.completed_at = event.created_at.clone();
                    }
                }
                task.updated_at = event.created_at.clone();
            }
        }
        "upload.queue.file.failed" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                if let Some(file) = find_file_mut(task, &relative_path(&event.payload)) {
                    file.status = "failed".to_string();
                    file.error = string_field(&event.payload, "error");
                }
                task.updated_at = event.created_at.clone();
            }
        }
        "upload.queue.job.created" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                if let Some(job) = event.payload.get("job") {
                    task.job = job.clone();
                }
                task.updated_at = event.created_at.clone();
            }
        }
        "knowledge.sync.requested" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                task.knowledge_status = "pending".to_string();
                task.knowledge_error.clear();
                task.updated_at = event.created_at.clone();
            }
        }
        "knowledge.sync.started" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                task.knowledge_status = "syncing".to_string();
                task.knowledge_error.clear();
                task.updated_at = event.created_at.clone();
            }
        }
        "knowledge.sync.completed" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                task.knowledge_status = "synced".to_string();
                task.knowledge_error.clear();
                task.knowledge_synced_at = event.created_at.clone();
                task.updated_at = event.created_at.clone();
            }
        }
        "knowledge.sync.failed" => {
            if let Some(task) = find_task_mut(state, &task_id(&event.payload)) {
                task.knowledge_status = "failed".to_string();
                task.knowledge_error = string_field(&event.payload, "error");
                task.updated_at = event.created_at.clone();
            }
        }
        "upload.queue.cleared" => {
            let task_ids = event
                .payload
                .get("taskIds")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            if task_ids.is_empty() {
                state
                    .tasks
                    .retain(|task| !matches!(task.status.as_str(), "completed" | "cancelled"));
            } else {
                state
                    .tasks
                    .retain(|task| !task_ids.iter().any(|item| item == &task.task_id));
            }
        }
        _ => {}
    }
}

fn upsert_task(state: &mut UploadQueueState, mut task: UploadQueueTask) {
    if task.status.trim().is_empty() {
        task.status = "queued".to_string();
    }
    if task.settings.is_null() {
        task.settings = json!({});
    }
    if task.job.is_null() {
        task.job = json!({});
    }
    if task.result.is_null() {
        task.result = json!({});
    }
    if task.upload_session.is_null() {
        task.upload_session = json!({});
    }
    if task.knowledge_status.trim().is_empty() {
        task.knowledge_status = "pending".to_string();
    }
    recompute_task_progress(&mut task);
    match state
        .tasks
        .iter()
        .position(|item| item.task_id == task.task_id)
    {
        Some(index) => state.tasks[index] = task,
        None => state.tasks.push(task),
    }
}

fn find_task_mut<'a>(
    state: &'a mut UploadQueueState,
    task_id: &str,
) -> Option<&'a mut UploadQueueTask> {
    if task_id.trim().is_empty() {
        return None;
    }
    state.tasks.iter_mut().find(|task| task.task_id == task_id)
}

fn find_file_mut<'a>(
    task: &'a mut UploadQueueTask,
    relative_path: &str,
) -> Option<&'a mut UploadQueueFile> {
    if relative_path.trim().is_empty() {
        return None;
    }
    task.files
        .iter_mut()
        .find(|file| file.relative_path == relative_path)
}

fn apply_session_to_task(task: &mut UploadQueueTask, session: &Value) {
    let Some(files) = session.get("files").and_then(Value::as_array) else {
        recompute_task_progress(task);
        return;
    };
    for remote in files {
        let relative_path = remote
            .get("relativePath")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if relative_path.is_empty() {
            continue;
        }
        if let Some(local) = find_file_mut(task, relative_path) {
            local.received_bytes = remote
                .get("receivedBytes")
                .and_then(Value::as_u64)
                .unwrap_or(local.received_bytes)
                .min(local.byte_size);
            local.status = if remote
                .get("completed")
                .and_then(Value::as_bool)
                .unwrap_or(false)
                || (local.byte_size > 0 && local.received_bytes >= local.byte_size)
            {
                "completed".to_string()
            } else if local.received_bytes > 0 {
                "uploading".to_string()
            } else {
                local.status.clone()
            };
            local.completed_at = remote
                .get("completedAt")
                .and_then(Value::as_str)
                .unwrap_or(&local.completed_at)
                .to_string();
        }
    }
    recompute_task_progress(task);
}

fn recompute_task_progress(task: &mut UploadQueueTask) {
    let total = task.files.iter().map(|file| file.byte_size).sum::<u64>();
    if total == 0 {
        task.progress = if task.status == "completed" { 1.0 } else { 0.0 };
        return;
    }
    let received = task
        .files
        .iter()
        .map(|file| file.received_bytes.min(file.byte_size))
        .sum::<u64>();
    task.progress = (received as f64 / total as f64).clamp(0.0, 1.0);
}

fn task_id(payload: &Value) -> String {
    string_field(payload, "taskId")
}

fn relative_path(payload: &Value) -> String {
    string_field(payload, "relativePath")
}

fn string_field(payload: &Value, key: &str) -> String {
    payload
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

pub fn event_payload_with_metadata(event: &UploadQueueEvent) -> Value {
    let mut payload = match event.payload.clone() {
        Value::Object(object) => object,
        other => {
            let mut object = Map::new();
            object.insert("value".to_string(), other);
            object
        }
    };
    payload.insert("queueEventId".to_string(), json!(event.event_id));
    payload.insert("queueOffset".to_string(), json!(event.offset));
    payload.insert("queueCreatedAt".to_string(), json!(event.created_at));
    Value::Object(payload)
}
