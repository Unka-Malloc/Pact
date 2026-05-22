# client-cli/protocols/agent

本目录定义 `client-cli` 调用云端智能体的下游协议。

## 配置

URL 和凭据由 `client-cli` 持有，Flutter 不直接保存 agent secret。该协议与服务端
`custom-http` HTTP Adapter 使用同一组语义；`agentEndpointUrl` 等旧字段仍兼容。可写入
`<portable-data>/settings.json`：

```json
{
  "customModelAlias": "kb-http",
  "customModelLabel": "Knowledge HTTP Adapter",
  "customHttpAdapter": {
    "alias": "kb-http",
    "url": "https://agent.example/run",
    "token": "secret-token",
    "tokenHeader": "token",
    "agentName": "knowledge-agent",
    "pluginList": ["knowledge"],
    "engine": "cloud",
    "parameters": {}
  }
}
```

`tokenHeader` 默认是 `token`。兼容旧字段 `agentAuthorization` / `authorization`，这类字段会使用
`authorization` 作为 header 名。

## 服务端智能体注册表

客户端连接服务端后会通过 `GET /api/agents` 拉取服务端可用智能体列表，并写入
`<portable-data>/backend/agent-registry.json`。命令行入口：

```bash
pact-client agents sync [--service-url URL]
pact-client agents list
```

`agents.list` 会把本地 `customHttpAdapter` 直连项与服务端注册表合并。服务端条目的
`callMode` 为 `server-proxy`，客户端调用时走 `/api/agent-gateway/call`，不会拿到服务端保存的外部
URL 或 token；本地自定义条目的 `callMode` 为 `local-direct`，仍由 `client-cli` 持有 URL 和凭据。
如果本地和服务端存在同名 alias，客户端优先使用本地直连配置。

## 请求

`client-cli` 发送 `POST`，Header 固定包含：

- `Content-Type: application/json`
- `Accept: text/event-stream, application/json`
- `<agentTokenHeader>: <agentToken>`，仅在 token 已配置时发送。

Body 为 JSON：

```json
{
  "agentName": "knowledge-agent",
  "pluginList": ["knowledge"],
  "question": "用户问题",
  "sessionId": "session-id",
  "userId": "user-id",
  "projectId": "project-id",
  "engine": "cloud",
  "parameters": {}
}
```

`knowledge.agent.answer` 会把本地离线检索结果写入 `parameters.knowledgeContextMarkdown`、
`parameters.knowledgeCitations` 和 `parameters.knowledgeSearch`。

## 流式响应

智能体可返回 SSE：

```text
data:{"type":"answer","data":{"content":"Hello"},"finish":false}
data:{"type":"finish","data":{"content":""},"finish":true}
```

客户端只把 `type=answer` 的 `data.content` 作为主回答拼接；如果没有 `answer` 事件，则降级使用
`type=text`，再降级使用 `rawData.content` 内部 JSON 的 `text` 字段。`dialogId` 会单独保留。
