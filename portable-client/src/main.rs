use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use anyhow::{Context, Result, anyhow};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use directories::ProjectDirs;
use mime_guess::MimeGuess;
use rfd::FileDialog;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use i_slint_backend_winit::{EventResult, WinitWindowAccessor, winit};
use slint::{ComponentHandle, ModelRc, SharedString, VecModel};
use walkdir::WalkDir;

slint::include_modules!();

const PORTABLE_DATA_DIR_NAME: &str = "portable-data";
const EXPORTS_DIR_NAME: &str = "exports";

const SUPPORTED_EXTENSIONS: &[&str] = &[
    "txt", "md", "markdown", "csv", "json", "yaml", "yml", "xml", "html", "htm", "js", "ts",
    "tsx", "jsx", "py", "java", "c", "cpp", "h", "hpp", "ini", "log", "pdf", "doc", "docx",
    "dotx", "ppt", "pptx", "pps", "ppsx", "xls", "xlsx", "xlsm", "rtf", "msg", "eml", "epub",
    "odt", "ods", "odp", "png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff",
];

const DEFAULT_SYSTEM_PROMPT: &str = r#"你是一个知识整理智能体。输入材料已经先经过规则切分器，形成了带 chunkId 的稳定知识块。

你的职责：
1. 基于已有 chunks 生成高质量知识文档与模拟问答对。
2. 不要跨不相关 chunks 合并内容。
3. 不要改写事实，不要补充输入中不存在的信息。

输出要求：
1. 只输出 JSON，不要输出解释、Markdown、代码块。
2. 严格遵循这个结构：
{
  "documents": [
    {
      "title": "知识单元标题",
      "source": "来源文件名或“粘贴文本”",
      "content": "知识单元正文",
      "tags": ["标签1", "标签2"],
      "chunkIds": ["source::chunk-1"],
      "timestamp": "ISO-8601 时间戳"
    }
  ],
  "qaPairs": [
    {
      "question": "问题",
      "answer": "答案",
      "source": "来源文件名或“粘贴文本”",
      "documentTitles": ["相关知识单元标题"],
      "chunkIds": ["source::chunk-1"],
      "timestamp": "ISO-8601 时间戳"
    }
  ]
}
3. 允许在同一个 chunk 内细分多个知识文档，但不要跨 chunk 任意拼接。
4. 所有 documents 和 qaPairs 都必须带 timestamp，并使用提供的统一时间戳。
5. 当输入包含图片时，只能基于图中可直接观察到的内容补充描述，不要臆测。"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientConfig {
    server_base_url: String,
    api_base_url: String,
    api_key: String,
    model: String,
    system_prompt: String,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            server_base_url: String::new(),
            api_base_url: "https://api.openai.com/v1".to_string(),
            api_key: String::new(),
            model: "gpt-4.1-mini".to_string(),
            system_prompt: DEFAULT_SYSTEM_PROMPT.to_string(),
        }
    }
}

#[derive(Debug, Clone)]
struct SelectedFile {
    path: PathBuf,
    label: String,
    relative_path: Option<String>,
}

#[derive(Debug, Clone)]
struct ResultEntry {
    label: String,
    preview: String,
}

#[derive(Debug, Default)]
struct AppState {
    selected_files: Vec<SelectedFile>,
    result: Option<Value>,
    result_entries: Vec<ResultEntry>,
    selected_result_index: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentSettings {
    api_base_url: String,
    api_key: String,
    model: String,
    system_prompt: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadedFilePayload {
    name: String,
    media_type: String,
    data_base64: String,
    relative_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SplitPayload {
    input_text: String,
    file_paths: Vec<String>,
    uploaded_files: Vec<UploadedFilePayload>,
    settings: AgentSettings,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SplitJob {
    id: String,
    status: String,
    progress_percent: f32,
    stage: String,
    error: Option<String>,
}

fn project_dirs() -> Result<ProjectDirs> {
    ProjectDirs::from("com", "splitall", "portable-client")
        .ok_or_else(|| anyhow!("无法确定本地配置目录。"))
}

fn fallback_data_dir() -> Result<PathBuf> {
    Ok(project_dirs()?.config_dir().to_path_buf())
}

fn default_portable_data_dir() -> Result<PathBuf> {
    let current_exe =
        std::env::current_exe().context("无法确定当前程序所在位置，不能创建便携数据目录。")?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| anyhow!("无法确定当前程序目录。"))?;

    let is_macos_bundle = exe_dir
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name == "MacOS")
        .unwrap_or(false)
        && exe_dir
            .parent()
            .and_then(|path| path.file_name())
            .and_then(|name| name.to_str())
            .map(|name| name == "Contents")
            .unwrap_or(false);

    if is_macos_bundle {
        return Ok(exe_dir
            .parent()
            .expect("validated macOS app bundle layout")
            .join("Resources")
            .join(PORTABLE_DATA_DIR_NAME));
    }

    Ok(exe_dir.join(PORTABLE_DATA_DIR_NAME))
}

fn data_dir() -> Result<PathBuf> {
    if let Some(custom) = std::env::var_os("SPLITALL_PORTABLE_DIR") {
        let custom_path = PathBuf::from(custom);
        fs::create_dir_all(&custom_path).with_context(|| {
            format!("创建便携数据目录失败：{}", custom_path.display())
        })?;
        return Ok(custom_path);
    }

    let portable_path = default_portable_data_dir()?;
    match fs::create_dir_all(&portable_path) {
        Ok(()) => Ok(portable_path),
        Err(_) => {
            let fallback = fallback_data_dir()?;
            fs::create_dir_all(&fallback)
                .with_context(|| format!("创建本地配置目录失败：{}", fallback.display()))?;
            Ok(fallback)
        }
    }
}

fn config_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("settings.json"))
}

fn export_dir() -> Result<PathBuf> {
    let exports = data_dir()?.join(EXPORTS_DIR_NAME);
    fs::create_dir_all(&exports)
        .with_context(|| format!("创建导出目录失败：{}", exports.display()))?;
    Ok(exports)
}

fn load_config() -> Result<ClientConfig> {
    let path = config_path()?;

    match fs::read_to_string(&path) {
        Ok(raw) => Ok(serde_json::from_str(&raw).unwrap_or_default()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(ClientConfig::default()),
        Err(error) => Err(error).with_context(|| format!("读取配置失败：{}", path.display())),
    }
}

fn save_config(config: &ClientConfig) -> Result<()> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    fs::write(&path, serde_json::to_vec_pretty(config)?)
        .with_context(|| format!("写入配置失败：{}", path.display()))
}

fn normalize_base_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

fn build_url(base_url: &str, endpoint: &str) -> Result<String> {
    let normalized = normalize_base_url(base_url);
    if normalized.is_empty() {
        return Err(anyhow!("请先填写服务地址。"));
    }

    Ok(format!("{normalized}{endpoint}"))
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(120))
        .build()
}

fn parse_error_body(raw: String) -> String {
    serde_json::from_str::<Value>(&raw)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| value.get("message").and_then(Value::as_str).map(str::to_string))
        })
        .filter(|message| !message.is_empty())
        .unwrap_or(raw)
}

fn handle_ureq_error(error: ureq::Error) -> anyhow::Error {
    match error {
        ureq::Error::Status(_, response) => {
            let body = response.into_string().unwrap_or_else(|_| "请求失败".to_string());
            anyhow!(parse_error_body(body))
        }
        ureq::Error::Transport(transport) => anyhow!(transport.to_string()),
    }
}

fn get_json<T: DeserializeOwned>(base_url: &str, endpoint: &str) -> Result<T> {
    let url = build_url(base_url, endpoint)?;
    let response = agent().get(&url).call().map_err(handle_ureq_error)?;
    response.into_json().map_err(Into::into)
}

fn post_json<T: DeserializeOwned, P: Serialize>(base_url: &str, endpoint: &str, payload: &P) -> Result<T> {
    let url = build_url(base_url, endpoint)?;
    let response = agent()
        .post(&url)
        .send_json(serde_json::to_value(payload)?)
        .map_err(handle_ureq_error)?;
    response.into_json().map_err(Into::into)
}

fn post_bytes<P: Serialize>(base_url: &str, endpoint: &str, payload: &P) -> Result<Vec<u8>> {
    let url = build_url(base_url, endpoint)?;
    let response = agent()
        .post(&url)
        .send_json(serde_json::to_value(payload)?)
        .map_err(handle_ureq_error)?;
    let mut reader = response.into_reader();
    let mut bytes = Vec::new();
    reader.read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn read_config_from_ui(ui: &AppWindow) -> ClientConfig {
    ClientConfig {
        server_base_url: ui.get_server_url().to_string(),
        api_base_url: ui.get_api_base_url().to_string(),
        api_key: ui.get_api_key().to_string(),
        model: ui.get_model_name().to_string(),
        system_prompt: ui.get_system_prompt().to_string(),
    }
}

fn apply_config_to_ui(ui: &AppWindow, config: &ClientConfig) {
    ui.set_server_url(config.server_base_url.clone().into());
    ui.set_api_base_url(config.api_base_url.clone().into());
    ui.set_api_key(config.api_key.clone().into());
    ui.set_model_name(config.model.clone().into());
    ui.set_system_prompt(config.system_prompt.clone().into());
}

fn set_status(ui: &AppWindow, status: impl Into<SharedString>, progress: f32) {
    ui.set_status_text(status.into());
    ui.set_progress_value(progress.clamp(0.0, 1.0));
}

fn supported_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| SUPPORTED_EXTENSIONS.iter().any(|candidate| candidate.eq_ignore_ascii_case(ext)))
        .unwrap_or(false)
}

fn dedupe_files(existing: &[SelectedFile], incoming: Vec<SelectedFile>) -> Vec<SelectedFile> {
    let mut seen = HashSet::new();
    let mut combined = Vec::new();

    for file in existing.iter().chain(incoming.iter()) {
        let key = file
            .path
            .canonicalize()
            .unwrap_or_else(|_| file.path.clone())
            .to_string_lossy()
            .to_string();

        if seen.insert(key) {
            combined.push(file.clone());
        }
    }

    combined
}

fn gather_folder_files(root: &Path) -> Vec<SelectedFile> {
    WalkDir::new(root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .map(|entry| entry.into_path())
        .filter(|path| supported_file(path))
        .filter_map(|path| {
            let relative = path.strip_prefix(root).ok()?;
            let relative_path = relative
                .components()
                .map(|component| component.as_os_str().to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join("/");

            Some(SelectedFile {
                label: relative_path.clone(),
                path,
                relative_path: Some(relative_path),
            })
        })
        .collect()
}

fn selected_from_paths(paths: Vec<PathBuf>) -> Vec<SelectedFile> {
    paths.into_iter()
        .filter(|path| supported_file(path))
        .map(|path| SelectedFile {
            label: path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| path.to_string_lossy().to_string()),
            path,
            relative_path: None,
        })
        .collect()
}

fn build_uploaded_files(files: &[SelectedFile]) -> Result<Vec<UploadedFilePayload>> {
    files.iter()
        .map(|file| {
            let bytes = fs::read(&file.path)
                .with_context(|| format!("读取文件失败：{}", file.path.display()))?;
            let media_type = MimeGuess::from_path(&file.path)
                .first_or_octet_stream()
                .essence_str()
                .to_string();

            Ok(UploadedFilePayload {
                name: file
                    .path
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string())
                    .unwrap_or_else(|| file.label.clone()),
                media_type,
                data_base64: BASE64.encode(bytes),
                relative_path: file.relative_path.clone(),
            })
        })
        .collect()
}

fn string_model(items: Vec<String>) -> ModelRc<SharedString> {
    let values = items
        .into_iter()
        .map(SharedString::from)
        .collect::<Vec<_>>();
    ModelRc::new(VecModel::from(values))
}

fn update_file_list(ui: &AppWindow, files: &[SelectedFile]) {
    ui.set_file_items(string_model(
        files.iter().map(|file| file.label.clone()).collect(),
    ));
}

fn warning_messages(result: &Value) -> Vec<String> {
    result
        .get("warnings")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|warning| warning.as_str().map(str::to_string))
        .collect::<Vec<_>>()
}

fn result_counts(result: &Value) -> (usize, usize) {
    let documents = result
        .get("documents")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let qa_pairs = result
        .get("qaPairs")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);

    (documents, qa_pairs)
}

fn joined_field(value: Option<&Value>, empty: &str) -> String {
    let values = value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if values.is_empty() {
        empty.to_string()
    } else {
        values.join("、")
    }
}

fn build_overview_preview(result: &Value) -> String {
    let (documents, qa_pairs) = result_counts(result);
    let generated_at = result
        .get("generatedAt")
        .and_then(Value::as_str)
        .unwrap_or("未知");
    let chunk_count = result
        .get("chunks")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let source_count = result
        .get("sourceFiles")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let warnings = warning_messages(result);

    let mut lines = vec![
        format!("生成时间：{generated_at}"),
        format!("知识文档：{documents}"),
        format!("模拟问答对：{qa_pairs}"),
        format!("切分块：{chunk_count}"),
        format!("源文件：{source_count}"),
    ];

    if !warnings.is_empty() {
        lines.push(String::new());
        lines.push("警告：".to_string());
        lines.extend(warnings);
    }

    lines.join("\n")
}

fn build_result_entries(result: &Value) -> Vec<ResultEntry> {
    let mut entries = vec![ResultEntry {
        label: "概览".to_string(),
        preview: build_overview_preview(result),
    }];

    if let Some(documents) = result.get("documents").and_then(Value::as_array) {
        for (index, document) in documents.iter().enumerate() {
            let title = document
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("未命名知识单元");
            let source = document
                .get("source")
                .and_then(Value::as_str)
                .unwrap_or("未标记来源");
            let timestamp = document
                .get("timestamp")
                .and_then(Value::as_str)
                .unwrap_or("未记录");
            let content = document
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or("");
            let tags = joined_field(document.get("tags"), "无");
            let chunk_ids = joined_field(document.get("chunkIds"), "无");

            entries.push(ResultEntry {
                label: format!("文档 {:02} · {title}", index + 1),
                preview: format!(
                    "标题：{title}\n来源：{source}\n时间：{timestamp}\n标签：{tags}\n关联块：{chunk_ids}\n\n{content}"
                ),
            });
        }
    }

    if let Some(qa_pairs) = result.get("qaPairs").and_then(Value::as_array) {
        for (index, qa) in qa_pairs.iter().enumerate() {
            let question = qa
                .get("question")
                .and_then(Value::as_str)
                .unwrap_or("未命名问题");
            let answer = qa.get("answer").and_then(Value::as_str).unwrap_or("");
            let source = qa
                .get("source")
                .and_then(Value::as_str)
                .unwrap_or("未标记来源");
            let timestamp = qa
                .get("timestamp")
                .and_then(Value::as_str)
                .unwrap_or("未记录");
            let document_titles = joined_field(qa.get("documentTitles"), "无");
            let chunk_ids = joined_field(qa.get("chunkIds"), "无");

            entries.push(ResultEntry {
                label: format!("问答 {:02} · {question}", index + 1),
                preview: format!(
                    "问题：{question}\n来源：{source}\n时间：{timestamp}\n关联文档：{document_titles}\n关联块：{chunk_ids}\n\n回答：\n{answer}"
                ),
            });
        }
    }

    entries
}

fn clear_result_view(ui: &AppWindow, state: &mut AppState) {
    state.result = None;
    state.result_entries.clear();
    state.selected_result_index = None;
    ui.set_has_result(false);
    ui.set_selected_result_index(-1);
    ui.set_result_items(string_model(Vec::new()));
    ui.set_preview_text("".into());
    ui.set_result_meta("暂无结果".into());
}

fn apply_result_view(ui: &AppWindow, state: &mut AppState, result: Value) {
    let entries = build_result_entries(&result);
    let selected_preview = entries
        .first()
        .map(|entry| entry.preview.clone())
        .unwrap_or_default();
    let selected_index = if entries.is_empty() { -1 } else { 0 };
    let labels = entries
        .iter()
        .map(|entry| entry.label.clone())
        .collect::<Vec<_>>();
    let (documents, qa_pairs) = result_counts(&result);
    let warning_count = warning_messages(&result).len();

    state.result = Some(result);
    state.result_entries = entries;
    state.selected_result_index = if selected_index >= 0 { Some(0) } else { None };

    ui.set_has_result(true);
    ui.set_selected_result_index(selected_index);
    ui.set_result_items(string_model(labels));
    ui.set_preview_text(selected_preview.into());
    ui.set_result_meta(
        if warning_count > 0 {
            format!("文档 {documents} 条 · 问答 {qa_pairs} 条 · 警告 {warning_count} 条")
        } else {
            format!("文档 {documents} 条 · 问答 {qa_pairs} 条")
        }
        .into(),
    );
}

fn set_task_row(
    ui: &AppWindow,
    status: impl Into<SharedString>,
    progress_percent: f32,
    stage: impl Into<SharedString>,
) {
    ui.set_task_status(status.into());
    ui.set_task_progress_text(format!("{:.0}%", progress_percent.clamp(0.0, 100.0)).into());
    ui.set_task_stage(stage.into());
}

fn status_label(status: &str) -> &'static str {
    match status {
        "queued" | "pending" => "排队中",
        "running" => "处理中",
        "completed" => "已完成",
        "failed" => "失败",
        "cancelled" | "canceled" => "已取消",
        _ => "等待中",
    }
}

fn merge_dropped_path(
    existing: &[SelectedFile],
    dropped_path: &Path,
) -> (Vec<SelectedFile>, String) {
    if dropped_path.is_dir() {
        let discovered = gather_folder_files(dropped_path);
        if discovered.is_empty() {
            return (
                existing.to_vec(),
                format!(
                    "拖入的文件夹中没有可处理文件：{}",
                    dropped_path.display()
                ),
            );
        }

        let added_count = discovered.len();
        let combined = dedupe_files(existing, discovered);
        return (
            combined,
            format!(
                "已拖入文件夹：{}，加入 {} 个文件。",
                dropped_path.display(),
                added_count
            ),
        );
    }

    if !supported_file(dropped_path) {
        return (
            existing.to_vec(),
            format!("拖入的文件暂不支持：{}", dropped_path.display()),
        );
    }

    let combined = dedupe_files(
        existing,
        selected_from_paths(vec![dropped_path.to_path_buf()]),
    );
    (
        combined,
        format!("已拖入文件：{}", dropped_path.display()),
    )
}

fn set_idle(ui: &AppWindow, status: impl Into<SharedString>, progress: f32) {
    ui.set_busy(false);
    ui.set_start_button_text("重新提交".into());
    set_status(ui, status, progress);
}

fn main() -> Result<()> {
    let ui = AppWindow::new()?;
    let config = load_config()?;
    let state = Arc::new(Mutex::new(AppState::default()));

    apply_config_to_ui(&ui, &config);
    ui.set_file_items(string_model(Vec::new()));
    ui.set_result_items(string_model(Vec::new()));
    ui.set_preview_text("".into());
    ui.set_result_meta("暂无结果".into());
    ui.set_status_text("等待任务提交。".into());
    ui.set_start_button_text("提交任务".into());
    ui.set_task_status("等待中".into());
    ui.set_task_progress_text("0%".into());
    ui.set_task_stage("尚未创建任务".into());
    ui.set_progress_value(0.0);
    ui.set_busy(false);
    ui.set_has_result(false);
    ui.set_selected_result_index(-1);

    {
        let ui_weak = ui.as_weak();
        let state = Arc::clone(&state);
        ui.on_choose_files(move || {
            let Some(ui) = ui_weak.upgrade() else {
                return;
            };

            let picked = FileDialog::new()
                .add_filter("可处理文件", SUPPORTED_EXTENSIONS)
                .pick_files()
                .unwrap_or_default();

            if picked.is_empty() {
                return;
            }

            let mut guard = state.lock().expect("state poisoned");
            guard.selected_files = dedupe_files(&guard.selected_files, selected_from_paths(picked));
            update_file_list(&ui, &guard.selected_files);
            set_status(&ui, "文件已加入待处理列表。", ui.get_progress_value());
        });
    }

    {
        let ui_weak = ui.as_weak();
        let state = Arc::clone(&state);
        ui.on_choose_folder(move || {
            let Some(ui) = ui_weak.upgrade() else {
                return;
            };

            let Some(folder) = FileDialog::new().pick_folder() else {
                return;
            };

            let discovered = gather_folder_files(&folder);
            if discovered.is_empty() {
                set_status(&ui, "文件夹中没有可处理的文件。", ui.get_progress_value());
                return;
            }

            let mut guard = state.lock().expect("state poisoned");
            guard.selected_files = dedupe_files(&guard.selected_files, discovered);
            update_file_list(&ui, &guard.selected_files);
            set_status(&ui, "文件夹已展开并加入待处理列表。", ui.get_progress_value());
        });
    }

    {
        let ui_weak = ui.as_weak();
        let state = Arc::clone(&state);
        ui.on_clear_files(move || {
            let Some(ui) = ui_weak.upgrade() else {
                return;
            };

            let mut guard = state.lock().expect("state poisoned");
            guard.selected_files.clear();
            update_file_list(&ui, &guard.selected_files);
            set_status(&ui, "文件列表已清空。", ui.get_progress_value());
        });
    }

    {
        let ui_weak = ui.as_weak();
        let state = Arc::clone(&state);
        ui.on_select_result(move |index| {
            let Some(ui) = ui_weak.upgrade() else {
                return;
            };

            let Ok(index) = usize::try_from(index) else {
                return;
            };

            let mut guard = state.lock().expect("state poisoned");
            let Some(preview) = guard
                .result_entries
                .get(index)
                .map(|entry| entry.preview.clone())
            else {
                return;
            };

            guard.selected_result_index = Some(index);
            ui.set_selected_result_index(index as i32);
            ui.set_preview_text(preview.into());
        });
    }

    {
        let ui_weak = ui.as_weak();
        let state = Arc::clone(&state);
        ui.window().on_winit_window_event(move |_window, event| {
            match event {
                winit::event::WindowEvent::HoveredFile(path) => {
                    if let Some(ui) = ui_weak.upgrade() {
                        if !ui.get_busy() {
                            set_status(
                                &ui,
                                format!("松开以导入：{}", path.display()),
                                ui.get_progress_value(),
                            );
                        }
                    }
                }
                winit::event::WindowEvent::HoveredFileCancelled => {
                    if let Some(ui) = ui_weak.upgrade() {
                        if !ui.get_busy() {
                            set_status(&ui, "等待任务提交。", ui.get_progress_value());
                        }
                    }
                }
                winit::event::WindowEvent::DroppedFile(path) => {
                    if let Some(ui) = ui_weak.upgrade() {
                        if ui.get_busy() {
                            return EventResult::Propagate;
                        }

                        let mut guard = state.lock().expect("state poisoned");
                        let (merged, status) = merge_dropped_path(&guard.selected_files, path);
                        guard.selected_files = merged;
                        update_file_list(&ui, &guard.selected_files);
                        set_status(&ui, status, ui.get_progress_value());
                    }
                }
                _ => {}
            }

            EventResult::Propagate
        });
    }

    {
        let ui_weak = ui.as_weak();
        ui.on_save_config(move || {
            let Some(ui) = ui_weak.upgrade() else {
                return;
            };

            let config = read_config_from_ui(&ui);
            match save_config(&config) {
                Ok(()) => {
                    let status = match config_path() {
                        Ok(path) => format!("配置已保存：{}", path.display()),
                        Err(_) => "配置已保存到本地。".to_string(),
                    };
                    set_status(&ui, status, ui.get_progress_value());
                }
                Err(error) => set_status(&ui, format!("保存配置失败：{error}"), ui.get_progress_value()),
            }
        });
    }

    {
        let ui_weak = ui.as_weak();
        let state = Arc::clone(&state);
        ui.on_start_job(move || {
            let Some(ui) = ui_weak.upgrade() else {
                return;
            };

            if ui.get_busy() {
                return;
            }

            let config = read_config_from_ui(&ui);
            if config.server_base_url.trim().is_empty() {
                set_status(&ui, "请先填写服务地址。", 0.0);
                return;
            }

            let input_text = ui.get_input_text().to_string();
            let selected_files = {
                let guard = state.lock().expect("state poisoned");
                guard.selected_files.clone()
            };

            if input_text.trim().is_empty() && selected_files.is_empty() {
                set_status(&ui, "没有可处理的内容。请粘贴文本或选择文件。", 0.0);
                return;
            }

            if let Err(error) = save_config(&config) {
                set_status(&ui, format!("保存配置失败：{error}"), 0.0);
                return;
            }

            ui.set_busy(true);
            ui.set_start_button_text("处理中...".into());
            {
                let mut guard = state.lock().expect("state poisoned");
                clear_result_view(&ui, &mut guard);
            }
            set_task_row(&ui, "提交中", 3.0, "正在读取文件并创建任务");
            set_status(&ui, "正在读取文件并创建任务...", 0.03);

            let ui_weak = ui.as_weak();
            let state = Arc::clone(&state);

            thread::spawn(move || {
                let task_result: Result<()> = (|| {
                    let uploaded_files = build_uploaded_files(&selected_files)?;
                    let payload = SplitPayload {
                        input_text,
                        file_paths: Vec::new(),
                        uploaded_files,
                        settings: AgentSettings {
                            api_base_url: config.api_base_url.clone(),
                            api_key: config.api_key.clone(),
                            model: config.model.clone(),
                            system_prompt: config.system_prompt.clone(),
                        },
                    };

                    let created_job: SplitJob =
                        post_json(&config.server_base_url, "/api/jobs", &payload)?;
                    let job_id = created_job.id.clone();
                    let created_stage = created_job.stage.clone();
                    let created_progress = created_job.progress_percent;
                    let created_status = status_label(&created_job.status).to_string();

                    let _ = ui_weak.upgrade_in_event_loop(move |ui| {
                        set_task_row(
                            &ui,
                            created_status,
                            created_progress,
                            created_stage.clone(),
                        );
                        set_status(
                            &ui,
                            format!("任务已提交：{job_id} · {created_stage}"),
                            (created_progress / 100.0).max(0.05),
                        );
                    });

                    loop {
                        thread::sleep(Duration::from_secs(2));
                        let job: SplitJob = get_json(
                            &config.server_base_url,
                            &format!("/api/jobs/{}", created_job.id),
                        )?;

                        let stage_message = if let Some(error) = &job.error {
                            format!("{}\n{}", job.stage, error)
                        } else {
                            job.stage.clone()
                        };

                        let progress = (job.progress_percent / 100.0).clamp(0.0, 1.0);
                        let progress_percent = job.progress_percent;
                        let _ = ui_weak.upgrade_in_event_loop({
                            let status_text = status_label(&job.status).to_string();
                            let stage_message = stage_message.clone();
                            move |ui| {
                                set_task_row(&ui, status_text.clone(), progress_percent, stage_message.clone());
                                set_status(&ui, stage_message, progress);
                            }
                        });

                        match job.status.as_str() {
                            "completed" => {
                                let result: Value = get_json(
                                    &config.server_base_url,
                                    &format!("/api/jobs/{}/result", created_job.id),
                                )?;

                                let _ = ui_weak.upgrade_in_event_loop(move |ui| {
                                    let mut guard = state.lock().expect("state poisoned");
                                    ui.set_busy(false);
                                    ui.set_start_button_text("重新提交".into());
                                    set_task_row(&ui, "已完成", 100.0, "结果已生成");
                                    apply_result_view(&ui, &mut guard, result);
                                    set_status(&ui, "任务已完成。可以导出结果。", 1.0);
                                });
                                return Ok(());
                            }
                            "failed" => {
                                let failed_progress = job.progress_percent;
                                let failed_stage = stage_message.clone();
                                let _ = ui_weak.upgrade_in_event_loop(move |ui| {
                                    set_task_row(&ui, "失败", failed_progress, failed_stage.clone());
                                    set_idle(&ui, failed_stage, progress);
                                });
                                return Err(anyhow!("任务失败。"));
                            }
                            _ => {}
                        }
                    }
                })();

                if let Err(error) = task_result {
                    let _ = ui_weak.upgrade_in_event_loop(move |ui| {
                        set_idle(&ui, format!("任务执行失败：{error}"), ui.get_progress_value());
                    });
                }
            });
        });
    }

    for format in ["json", "md", "docx"] {
        let ui_weak = ui.as_weak();
        let state = Arc::clone(&state);
        let format_name = format.to_string();

        let callback = move || {
            let Some(ui) = ui_weak.upgrade() else {
                return;
            };

            let mut dialog = FileDialog::new();
            if let Ok(default_dir) = export_dir() {
                dialog = dialog.set_directory(default_dir);
            }
            let save_path = dialog
                .set_file_name(match format_name.as_str() {
                    "json" => "splitall-result.json",
                    "md" => "splitall-result.md",
                    _ => "splitall-result.docx",
                })
                .save_file();

            let Some(save_path) = save_path else {
                return;
            };

            let config = read_config_from_ui(&ui);
            let result = {
                let guard = state.lock().expect("state poisoned");
                guard.result.clone()
            };

            let Some(result) = result else {
                set_status(&ui, "暂无可导出的结果。", ui.get_progress_value());
                return;
            };

            ui.set_busy(true);
            ui.set_start_button_text("处理中...".into());
            set_status(&ui, "正在导出结果...", ui.get_progress_value());

            let ui_weak = ui.as_weak();
            let format_name_for_thread = format_name.clone();
            thread::spawn(move || {
                let export_result: Result<()> = (|| {
                    let bytes = post_bytes(
                        &config.server_base_url,
                        "/api/export",
                        &json!({
                            "format": format_name_for_thread,
                            "result": result,
                        }),
                    )?;
                    fs::write(&save_path, bytes).with_context(|| {
                        format!("写入导出文件失败：{}", save_path.display())
                    })?;
                    Ok(())
                })();

                let _ = ui_weak.upgrade_in_event_loop(move |ui| match export_result {
                    Ok(()) => {
                        ui.set_busy(false);
                        ui.set_start_button_text("重新提交".into());
                        set_status(
                            &ui,
                            format!("导出完成：{}", save_path.display()),
                            ui.get_progress_value(),
                        );
                    }
                    Err(error) => {
                        ui.set_busy(false);
                        ui.set_start_button_text("重新提交".into());
                        set_status(&ui, format!("导出失败：{error}"), ui.get_progress_value());
                    }
                });
            });
        };

        match format {
            "json" => ui.on_export_json(callback),
            "md" => ui.on_export_md(callback),
            _ => ui.on_export_docx(callback),
        }
    }

    ui.run()?;
    Ok(())
}
