# AgentStudio 🚀

[English](README.md) | 简体中文

> 可控的智能体协作空间。

[![License: GPL-3.0-only](https://img.shields.io/badge/License-GPL_3.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)

当前的大模型和智能体（Agents）越来越强大，但它们往往各自为战，缺乏协同；传统的企业知识库虽然存储了大量资产，但缺少针对智能体的细粒度权限管控。

**AgentStudio 为此而生。**

AgentStudio 不造新的大模型，也不做另一个自治 Agent 平台。我们专攻生态中最缺的**“中间治理层”**：为各类本地智能体、自动化脚本和人类成员，提供一个**安全、受控、可编辑且 100% 可审计**的公共工作空间。

## ✨ 核心特性

- 🛡️ **“零信任”智能体治理 (Zero Trust)**：智能体只是外部操作员。系统的每一次状态变更（写入、导出），必须经过极度严格的 Policy Engine 和 Operation Ledger 裁决。
- 📚 **AgentLibrary (受控图书馆)**：颠覆传统的“知识库代理”。上游知识进入系统后会被重新切分与实时再授权。支持 `readInPlace`, `copyToContext`, `checkoutAllowed` 等极细粒度的出馆限制。
- 🌳 **统一 Checkpoint Tree (100% 审计)**：每一次文件修改、权限请求，甚至是**每一次的知识检索和被拒绝的访问**，都会生成不可篡改的 Checkpoint 节点，支持类似 Git 的 Append-only 安全恢复。
- 🔌 **全生态协议兼容 (MCP Native)**：无缝接入 OpenClaw、Cursor Agent、Claude Code 等任何智能体。全面拥抱 Model Context Protocol (MCP) 标准暴露工作空间能力。
- 📊 **资产贡献量化面板**：不仅消耗算力，更沉淀数字资产。系统内置贡献排行榜，量化评估哪个智能体或成员贡献了最具复用价值的知识、规则 (Rules) 和技能 (Skills)。

## 🏗️ 架构与技术栈

本项目遵循“模块化单体 (Modular Monolith)”原则，物理目录按职责严格收敛：

- **`server`**：核心控制面（Node.js + SQLite），负责鉴权、资产切分、状态机与 Ledger。
- **`server-web`**：管控台（Vue 3），提供人类视角的资产浏览器、审计视图和权限配置。
- **`client-cli`**：客户端执行层（Rust），负责本地环境适配、高吞吐交互。
- **`client-gui`**：跨端桌面应用（Flutter），提供轻量化的操作终端。
- **`docs`**：核心架构原则与设计决议记录。

## 🚀 快速开始

### 1. 准备环境

```bash
# 安装服务端依赖
npm install

# 安装客户端依赖 (Flutter/Rust 资产)
npm run client:get
```

### 2. 启动服务

一键启动完整的服务端 API 与 Web 管控台：

```bash
npm run start:all
```
*(开发模式请附加 `-- --dev` 参数启用 Vite 热更新)*

默认挂载完成后，即可通过浏览器访问服务端管控台，或通过本地配置的智能体（连接本机的 MCP Service 端点）开始协同操作。

### 3. CLI 快速交互

AgentStudio 提供了强大的 CLI 工具以支持 CI/CD 与终端快捷操作：

```bash
npm run cli -- health
npm run cli -- --file README.md --wait
npm run cli -- rpc-call jobs.list --params '{"limit":20}'
```

## 📖 核心文档导读

想要了解 AgentStudio 的底层哲学与设计决策，请务必阅读：

- 🏛️ [架构总览 (Architecture)](docs/Architecture.md)
- 🔒 [工作空间资产治理 (Workspace Governance)](docs/WORKSPACE-ASSET-GOVERNANCE.md)
- 🧠 [知识治理与 AgentLibrary (Knowledge Governance)](docs/KNOWLEDGE-GOVERNANCE.md)
- 👨‍💻 [开发者核心守则 (Developer Guidelines)](docs/DEVELOPER-GUIDELINES.md)

---

*“在 AgentStudio 中，智能体不被信任。我们只信任可验证的资产状态与可回放的操作账本。”*