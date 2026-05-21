# AgentStudio 🚀

English | [简体中文](README.zh-CN.md)

> A Controllable Agent Collaboration Space.

[![License: GPL-3.0-only](https://img.shields.io/badge/License-GPL_3.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)

While Large Language Models (LLMs) and local AI agents are becoming increasingly powerful, they often operate in isolated silos, lacking true collaboration. Traditional enterprise knowledge bases, on the other hand, store massive amounts of assets but fail to provide fine-grained, agent-centric access control.

**AgentStudio was built to bridge this exact gap.**

AgentStudio does not build yet another LLM, nor does it aim to be a monolithic autonomous agent platform. Instead, we focus exclusively on the missing **"Governance Middleware"**: providing a **secure, controllable, editable, and 100% auditable** shared workspace for various local agents, automation scripts, and human team members.

## ✨ Core Features

- 🛡️ **Zero Trust Agent Governance**: Agents are merely external operators. Every single state change (writes, exports) must pass through a strict Policy Engine and an immutable Operation Ledger.
- 📚 **AgentLibrary (Governed Knowledge)**: Disrupting traditional "knowledge base proxies." Upstream knowledge is dynamically sliced and re-authorized upon entering the system. We support hyper-granular egress controls like `readInPlace`, `copyToContext`, and `checkoutAllowed`.
- 🌳 **Unified Checkpoint Tree (100% Auditability)**: Every file modification, permission request, and even **every single knowledge retrieval or denied access** generates an immutable Checkpoint Node. This ensures an append-only, Git-like safe restore capability.
- 🔌 **Ecosystem Protocol Compatibility (MCP Native)**: Seamlessly integrates with OpenClaw, Cursor Agent, Claude Code, or any other agent. We fully embrace the Model Context Protocol (MCP) to expose workspace capabilities securely.
- 📊 **Asset Contribution Leaderboard**: Agents don't just burn compute; they accumulate digital assets. The built-in leaderboard quantifies and ranks which agent (or human) contributed the most reusable knowledge, rules, and skills to the team workspace.

## 🏗️ Architecture & Tech Stack

This project follows the "Modular Monolith" principle, strictly separating concerns into specific directories:

- **`server`**: The core Control Plane (Node.js + SQLite), handling authentication, asset slicing, state machines, and the Ledger.
- **`server-web`**: The management console (Vue 3), providing human-centric asset browsers, audit views, and permission configurations.
- **`client-cli`**: The client execution layer (Rust), handling local environment adapters and high-throughput interactions.
- **`client-gui`**: The cross-platform desktop application (Flutter), acting as a lightweight terminal.
- **`docs`**: The source of truth for architectural principles and design decisions.

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Install server dependencies
npm install

# Install client dependencies (Flutter/Rust assets)
npm run client:get
```

### 2. Start the Services

Start the complete backend API and the Web console with one command:

```bash
npm run start:all
```
*(For development with Vite HMR, append the `-- --dev` flag)*

Once mounted, you can access the management console via your browser or start collaborating by connecting your local agents to the MCP Service endpoint.

### 3. CLI Interactions

AgentStudio provides a powerful CLI tool for CI/CD and quick terminal operations:

```bash
npm run cli -- health
npm run cli -- --file README.md --wait
npm run cli -- rpc-call jobs.list --params '{"limit":20}'
```

## 📖 Essential Documentation

To understand the underlying philosophy and design decisions of AgentStudio, please read:

- 🏛️ [Architecture Overview](docs/Architecture.md)
- 🔒 [Workspace Asset Governance](docs/WORKSPACE-ASSET-GOVERNANCE.md)
- 🧠 [Knowledge Governance & AgentLibrary](docs/KNOWLEDGE-GOVERNANCE.md)
- 👨‍💻 [Developer Guidelines](docs/DEVELOPER-GUIDELINES.md)

---

*“In AgentStudio, agents are not trusted. We only trust verifiable asset states and a replayable operation ledger.”*