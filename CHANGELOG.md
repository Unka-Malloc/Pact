# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Upcoming changes will be documented here._

---

## [0.1.0] — 2026-05-22

### 🎉 Initial Release / 首次发布

The inaugural release of **Pact** — a controllable agent collaboration platform (可控的智能体协作空间).

### Added

#### Workspace Asset Governance / 工作空间资产治理
- Implemented the full Workspace Asset Governance framework with fine-grained policy engine
- Introduced the **Operation Ledger** — an append-only, immutable audit log for every state change (writes, exports, permission requests, and denied access)
- Asset lifecycle management with controlled ingestion, modification, and export flows

#### AgentLibrary / 智能体知识库
- Built the AgentLibrary governed knowledge system with **8-level access mode** hierarchy
- Upstream knowledge dynamic slicing and re-authorization upon ingestion
- Hyper-granular egress controls: `readInPlace`, `copyToContext`, `checkoutAllowed`, and more

#### Unified Checkpoint Tree / 统一检查点树
- Implemented the Unified Checkpoint Tree for 100% auditability
- Every file modification, permission request, and knowledge retrieval generates an immutable Checkpoint Node
- Append-only, Git-like safe restore capability across workspace history

#### MCP Service / MCP 服务
- Full Model Context Protocol (MCP) service implementation
- **HTTP transport** for network-based agent integration
- **stdio transport** for local agent communication
- Compatible with OpenClaw, Cursor Agent, Claude Code, and other MCP-compatible agents

#### Multi-Agent Knowledge Summarization / 多智能体知识摘要
- Integrated knowledge summarization pipeline powered by **LangGraph.js**
- Multi-agent orchestration for collaborative knowledge extraction
- Automated distillation of workspace knowledge into reusable summaries

#### Tool Management / 工具管理
- Tool Management v1 with declarative tool registration and lifecycle control
- Governed tool execution within the zero-trust security model
- Tool capability discovery and permission-scoped invocation

#### Asset Contribution Leaderboard / 资产贡献排行榜
- Built-in leaderboard quantifying and ranking agent/human contributions
- Tracks reusable knowledge, rules, and skills contributed to the team workspace
- Real-time scoring and ranking visualization

#### Web Console / 管理控制台
- Full-featured management console built with **Vue 3** and **Element Plus**
- Asset browser, audit log viewer, and permission configuration UI
- Real-time dashboard with contribution metrics and system health

#### CLI & GUI Clients / 命令行与图形客户端
- **CLI** (Rust): High-performance command-line client for CI/CD and terminal operations
- **GUI** (Flutter): Cross-platform desktop application as a lightweight terminal
- Both clients support full workspace interaction and agent management

#### Knowledge Distillation Pipeline / 知识蒸馏管道
- End-to-end knowledge distillation pipeline for workspace assets
- Automated extraction, transformation, and loading of knowledge artifacts
- Support for structured and unstructured knowledge sources

#### Offline Deployment / 离线部署
- Ubuntu server offline packaging for air-gapped environments
- Self-contained deployment bundle with all dependencies
- Docker and Docker Compose support for containerized deployment

#### External Knowledge Base Support / 外部知识库支持
- **pgvector** integration for PostgreSQL-based vector search
- **Qdrant** integration for dedicated vector database deployments
- **OpenSearch** integration for enterprise search and analytics
- Pluggable adapter architecture for additional knowledge base backends

[unreleased]: https://github.com/Unka-Malloc/Pact/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Unka-Malloc/Pact/releases/tag/v0.1.0
