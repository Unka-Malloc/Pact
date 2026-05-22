use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

#[derive(Clone, Debug)]
pub struct AgentClientConfig {
    pub alias: String,
    pub label: String,
    pub endpoint_url: String,
    pub token: Option<String>,
    pub token_header: String,
    pub agent_name: String,
    pub plugin_list: Vec<Value>,
    pub session_id: String,
    pub user_id: String,
    pub project_id: String,
    pub engine: String,
    pub parameters: Value,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStreamAccumulator {
    pub answer: String,
    pub text: String,
    pub raw_text: String,
    pub dialog_id: Option<String>,
    pub finished: bool,
    pub event_count: usize,
    pub answer_fragment_count: usize,
    pub text_fragment_count: usize,
    pub raw_text_fragment_count: usize,
    pub events: Vec<Value>,
}

impl AgentClientConfig {
    pub fn from_values(params: &Value, config: &Value) -> Result<Option<Self>> {
        let endpoint_url = first_string(
            params,
            config,
            &[
                "url",
                "customHttpAdapter.url",
            ],
        )
        .unwrap_or_default();
        if endpoint_url.trim().is_empty() {
            return Ok(None);
        }

        let token = first_string(
            params,
            config,
            &[
                "token",
                "customHttpAdapter.token",
                "customHttpAdapter.apiKey",
            ],
        );
        let token_header = first_string(
            params,
            config,
            &[
                "tokenHeader",
                "customHttpAdapter.tokenHeader",
            ],
        )
        .unwrap_or_else(|| "token".to_string());

        let mut parameters = first_object(
            config,
            &["parameters", "customHttpAdapter.parameters"],
        )
        .unwrap_or_default();
        if let Some(params_parameters) = first_object(
            params,
            &[
                "parameters",
                "customHttpAdapter.parameters",
            ],
        ) {
            merge_object(&mut parameters, params_parameters);
        }

        Ok(Some(Self {
            alias: first_string(
                params,
                config,
                &[
                    "agentAlias",
                    "alias",
                    "customModelAlias",
                    "customHttpAdapter.alias",
                ],
            )
            .unwrap_or_else(|| "external-agent".to_string()),
            label: first_string(
                params,
                config,
                &[
                    "agentLabel",
                    "label",
                    "customModelLabel",
                    "customHttpAdapter.label",
                ],
            )
            .unwrap_or_else(|| "自定义 HTTP Adapter".to_string()),
            endpoint_url,
            token,
            token_header,
            agent_name: first_string(
                params,
                config,
                &["agentName", "customHttpAdapter.agentName"],
            )
            .unwrap_or_default(),
            plugin_list: first_array(
                params,
                config,
                &[
                    "pluginList",
                    "customHttpAdapter.pluginList",
                ],
            ),
            session_id: first_string(
                params,
                config,
                &[
                    "sessionId",
                    "customHttpAdapter.sessionId",
                ],
            )
            .unwrap_or_default(),
            user_id: first_string(
                params,
                config,
                &["userId", "customHttpAdapter.userId"],
            )
            .unwrap_or_default(),
            project_id: first_string(
                params,
                config,
                &[
                    "projectId",
                    "customHttpAdapter.projectId",
                ],
            )
            .unwrap_or_default(),
            engine: first_string(
                params,
                config,
                &[
                    "engine",
                    "customHttpAdapter.engine",
                ],
            )
            .unwrap_or_default(),
            parameters: Value::Object(parameters),
        }))
    }

    pub fn request_body(&self, question: &str, runtime_parameters: Value) -> Value {
        let mut parameters = self
            .parameters
            .as_object()
            .cloned()
            .unwrap_or_else(Map::new);
        if let Some(runtime) = runtime_parameters.as_object() {
            merge_object(&mut parameters, runtime.clone());
        }
        json!({
            "agentName": self.agent_name,
            "pluginList": self.plugin_list,
            "question": question,
            "sessionId": self.session_id,
            "userId": self.user_id,
            "projectId": self.project_id,
            "engine": self.engine,
            "parameters": parameters
        })
    }

    fn request_summary(&self) -> Value {
        json!({
            "alias": self.alias,
            "label": self.label,
            "endpointUrl": self.endpoint_url,
            "tokenHeader": self.token.as_ref().map(|_| self.token_header.as_str()),
            "agentName": self.agent_name,
            "pluginList": self.plugin_list,
            "sessionId": self.session_id,
            "userId": self.user_id,
            "projectId": self.project_id,
            "engine": self.engine
        })
    }
}

pub fn invoke_agent(
    config: &AgentClientConfig,
    question: &str,
    runtime_parameters: Value,
) -> Result<Value> {
    let body = config.request_body(question, runtime_parameters);
    let mut request = ureq::post(&config.endpoint_url)
        .set("Content-Type", "application/json")
        .set("Accept", "text/event-stream, application/json");
    if let Some(token) = config
        .token
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        request = request.set(&config.token_header, token);
    }

    let response = request.send_json(body.clone());
    let (status, content_type, raw_body) = match response {
        Ok(response) => {
            let status = response.status();
            let content_type = response.header("content-type").unwrap_or("").to_string();
            let raw_body = response.into_string()?;
            (status, content_type, raw_body)
        }
        Err(ureq::Error::Status(status, response)) => {
            let content_type = response.header("content-type").unwrap_or("").to_string();
            let raw_body = response.into_string().unwrap_or_default();
            (status, content_type, raw_body)
        }
        Err(error) => return Err(anyhow!(error.to_string())),
    };

    let is_stream = content_type.contains("text/event-stream")
        || raw_body
            .lines()
            .any(|line| line.trim_start().starts_with("data:"));
    let mut result = json!({
        "ok": (200..300).contains(&status),
        "answered": false,
        "status": status,
        "contentType": content_type,
        "request": config.request_summary(),
        "requestBody": body
    });

    if is_stream {
        let stream = parse_agent_stream(&raw_body);
        let answer = if !stream.answer.is_empty() {
            stream.answer.clone()
        } else if !stream.text.is_empty() {
            stream.text.clone()
        } else {
            stream.raw_text.clone()
        };
        result["answered"] = json!(!answer.is_empty());
        result["answer"] = json!(answer);
        result["stream"] = json!(stream);
        return Ok(result);
    }

    match serde_json::from_str::<Value>(&raw_body) {
        Ok(value) => {
            let answer = value
                .get("answer")
                .or_else(|| value.get("content"))
                .or_else(|| value.pointer("/data/answer"))
                .or_else(|| value.pointer("/data/content"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            result["answered"] = json!(!answer.is_empty() || value.is_object());
            result["answer"] = json!(answer);
            result["response"] = value;
        }
        Err(_) => {
            result["answered"] = json!(!raw_body.is_empty());
            result["answer"] = json!(raw_body);
        }
    }
    Ok(result)
}

pub fn parse_agent_stream(raw: &str) -> AgentStreamAccumulator {
    let mut parsed = AgentStreamAccumulator::default();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(':') {
            continue;
        }
        let Some(payload) = line.strip_prefix("data:") else {
            continue;
        };
        let payload = payload.trim();
        if payload.is_empty() || payload == "[DONE]" {
            parsed.finished = true;
            continue;
        }
        let Ok(event) = serde_json::from_str::<Value>(payload) else {
            continue;
        };
        parsed.event_count += 1;
        let event_type = event
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let content = event
            .get("data")
            .and_then(|data| data.get("content"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        match event_type {
            "answer" => {
                parsed.answer.push_str(content);
                parsed.answer_fragment_count += 1;
            }
            "text" => {
                parsed.text.push_str(content);
                parsed.text_fragment_count += 1;
            }
            "rawData" => {
                if let Ok(raw_value) = serde_json::from_str::<Value>(content) {
                    if let Some(text) = raw_value.get("text").and_then(Value::as_str) {
                        parsed.raw_text.push_str(text);
                        parsed.raw_text_fragment_count += 1;
                    }
                }
            }
            "dialogId" => {
                if !content.trim().is_empty() {
                    parsed.dialog_id = Some(content.to_string());
                }
            }
            "finish" => {
                parsed.finished = true;
            }
            _ => {}
        }
        if event
            .get("finish")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            parsed.finished = true;
        }
        parsed.events.push(event);
    }
    parsed
}

fn first_string(params: &Value, config: &Value, keys: &[&str]) -> Option<String> {
    for source in [params, config] {
        for key in keys {
            if let Some(value) = value_at(source, key).and_then(Value::as_str) {
                let value = value.trim();
                if !value.is_empty() {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

fn first_array(params: &Value, config: &Value, keys: &[&str]) -> Vec<Value> {
    for source in [params, config] {
        for key in keys {
            let Some(value) = value_at(source, key) else {
                continue;
            };
            if let Some(items) = value.as_array() {
                return items.clone();
            }
            if let Some(raw) = value.as_str() {
                let raw = raw.trim();
                if raw.is_empty() {
                    continue;
                }
                if let Ok(parsed) = serde_json::from_str::<Value>(raw) {
                    if let Some(items) = parsed.as_array() {
                        return items.clone();
                    }
                }
                return raw
                    .split(',')
                    .map(str::trim)
                    .filter(|item| !item.is_empty())
                    .map(|item| json!(item))
                    .collect();
            }
        }
    }
    Vec::new()
}

fn first_object(source: &Value, keys: &[&str]) -> Option<Map<String, Value>> {
    for key in keys {
        if let Some(object) = value_at(source, key).and_then(Value::as_object) {
            return Some(object.clone());
        }
    }
    None
}

fn value_at<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let mut current = value;
    for part in key.split('.') {
        current = current.get(part)?;
    }
    Some(current)
}

fn merge_object(target: &mut Map<String, Value>, source: Map<String, Value>) {
    for (key, value) in source {
        match (target.get_mut(&key), value) {
            (Some(Value::Object(target_object)), Value::Object(source_object)) => {
                merge_object(target_object, source_object);
            }
            (_, value) => {
                target.insert(key, value);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn parses_agent_sse_answer_fragments() {
        let stream = r#"
data:{"type":"answer","data":{"content":"$","nodeId":"node_end","riskDescription":null},"finish":false}
data:{"type":"answer","data":{"content":" echo","nodeId":"node_end","riskDescription":null},"finish":false}
data:{"type":"answer","data":{"content":" \"","nodeId":"node_end","riskDescription":null},"finish":false}
data:{"type":"answer","data":{"content":"Hello","nodeId":"node_end","riskDescription":null},"finish":false}
data:{"type":"answer","data":{"content":" \"","nodeId":"node_end","riskDescription":null},"finish":false}
data:{"type":"answer","data":{"content":" $","nodeId":"node_end","riskDescription":null},"finish":false}
data:{"type":"dialogId","data":{"content":"8681777426171495","nodeId":null,"riskDescription":null},"finish":false}
data:{"type":"finish","data":{"content":"","nodeId":null,"riskDescription":null},"finish":true}
"#;
        let parsed = parse_agent_stream(stream);
        assert_eq!(parsed.answer, "$ echo \"Hello \" $");
        assert_eq!(parsed.dialog_id.as_deref(), Some("8681777426171495"));
        assert!(parsed.finished);
        assert_eq!(parsed.answer_fragment_count, 6);
    }

    #[test]
    fn builds_configured_agent_request_body() {
        let params = json!({
            "question": "What changed?",
            "token": "secret",
            "parameters": { "limit": 8 }
        });
        let config = json!({
            "customModelAlias": "kb-http",
            "customModelLabel": "Knowledge HTTP Adapter",
            "customHttpAdapter": {
                "url": "https://agent.example/run",
                "agentName": "kb-agent",
                "pluginList": ["knowledge", "files"],
                "sessionId": "s1",
                "userId": "u1",
                "projectId": "p1",
                "engine": "cloud",
                "parameters": { "temperature": 0.2, "limit": 4 }
            }
        });
        let client_config = AgentClientConfig::from_values(&params, &config)
            .unwrap()
            .unwrap();
        let body = client_config.request_body("What changed?", json!({ "context": "local" }));
        assert_eq!(client_config.alias, "kb-http");
        assert_eq!(client_config.label, "Knowledge HTTP Adapter");
        assert_eq!(client_config.token_header, "token");
        assert_eq!(body["agentName"], "kb-agent");
        assert_eq!(body["pluginList"][0], "knowledge");
        assert_eq!(body["question"], "What changed?");
        assert_eq!(body["parameters"]["temperature"], 0.2);
        assert_eq!(body["parameters"]["limit"], 8);
        assert_eq!(body["parameters"]["context"], "local");
    }

    #[test]
    fn sends_agent_request_headers_body_and_combines_sse_answer() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = Vec::new();
            let mut content_length = None;
            loop {
                let mut chunk = [0_u8; 1024];
                let read = stream.read(&mut chunk).unwrap();
                if read == 0 {
                    break;
                }
                buffer.extend_from_slice(&chunk[..read]);
                let request_text = String::from_utf8_lossy(&buffer);
                if let Some(header_end) = request_text.find("\r\n\r\n") {
                    if content_length.is_none() {
                        content_length = request_text[..header_end].lines().find_map(|line| {
                            let (name, value) = line.split_once(':')?;
                            if name.eq_ignore_ascii_case("content-length") {
                                value.trim().parse::<usize>().ok()
                            } else {
                                None
                            }
                        });
                    }
                    if buffer.len() >= header_end + 4 + content_length.unwrap_or(0) {
                        break;
                    }
                }
            }

            let request_text = String::from_utf8_lossy(&buffer);
            let lower_request = request_text.to_ascii_lowercase();
            assert!(lower_request.contains("\r\ncontent-type: application/json"));
            assert!(lower_request.contains("\r\ntoken: secret-token"));
            let header_end = request_text.find("\r\n\r\n").unwrap();
            let body_len = content_length.unwrap();
            let body_start = header_end + 4;
            let body: Value =
                serde_json::from_slice(&buffer[body_start..body_start + body_len]).unwrap();
            assert_eq!(body["agentName"], "kb-agent");
            assert_eq!(body["pluginList"][0], "knowledge");
            assert_eq!(body["question"], "What is local?");
            assert_eq!(body["sessionId"], "s1");
            assert_eq!(body["userId"], "u1");
            assert_eq!(body["projectId"], "p1");
            assert_eq!(body["engine"], "cloud");
            assert_eq!(body["parameters"]["context"], "offline");

            let sse = concat!(
                "data:{\"type\":\"answer\",\"data\":{\"content\":\"Hel\"},\"finish\":false}\n\n",
                "data:{\"type\":\"answer\",\"data\":{\"content\":\"lo\"},\"finish\":false}\n\n",
                "data:{\"type\":\"finish\",\"data\":{\"content\":\"\"},\"finish\":true}\n\n"
            );
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\n\r\n{}",
                sse.len(),
                sse
            );
            stream.write_all(response.as_bytes()).unwrap();
        });

        let config = AgentClientConfig {
            alias: "kb-http".to_string(),
            label: "Knowledge HTTP Adapter".to_string(),
            endpoint_url: endpoint,
            token: Some("secret-token".to_string()),
            token_header: "token".to_string(),
            agent_name: "kb-agent".to_string(),
            plugin_list: vec![json!("knowledge")],
            session_id: "s1".to_string(),
            user_id: "u1".to_string(),
            project_id: "p1".to_string(),
            engine: "cloud".to_string(),
            parameters: json!({}),
        };
        let result =
            invoke_agent(&config, "What is local?", json!({ "context": "offline" })).unwrap();
        server.join().unwrap();
        assert_eq!(result["answer"], "Hello");
        assert_eq!(result["stream"]["answerFragmentCount"], 2);
        assert_eq!(result["request"]["tokenHeader"], "token");
    }
}
