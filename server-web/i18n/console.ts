import { readonly, ref } from "vue";

export type ConsoleLocale = "en" | "zh-CN";

export const CONSOLE_LANGUAGE_KEY = "pact-language";

const consoleLocaleState = ref<ConsoleLocale>("zh-CN");

export const currentConsoleLocale = readonly(consoleLocaleState);

export function setConsoleLocaleState(mode: ConsoleLocale) {
  consoleLocaleState.value = mode;
}

export const consoleLocales = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" },
] as const;

export const consoleMessages = {
  "zh-CN": {
    appTitle: "Pact 服务端控制台",
    loading: "正在初始化",
    connecting: "正在连接服务端…",
    close: "关闭",
    error: "错误",
    actions: {
      refresh: "刷新",
      refreshPage: "刷新本页所有组件",
      refreshing: "同步中",
      goImport: "去导入文件",
    },
    nav: {
      dashboard: "工作台",
      feed: "信息流",
      approvalFlow: "审批流",
      sources: "数据源",
      teamPanel: "团队管理",
      permissionGroups: "权限组",
      workspaces: "工作空间",
      devices: "客户端",
      knowledge: "团队资产",
      knowledgeManagement: "知识管理",
      wordCloud: "词汇库",
      knowledgeConfig: "知识库配置",
      debugPanel: "调试面板",
      knowledgeRecall: "知识召回",
      agentRetrieval: "智能检索",
      knowledgeDistillation: "知识蒸馏",
      agents: "智能体",
      skillHub: "技能库",
      agentTools: "技能管理",
      toolList: "工具列表",
      toolStats: "工具统计",
      maintenanceAgent: "智能巡检",
      agentConfig: "智能体仓库",
      contextManagement: "上下文管理",
      systemStatus: "系统运维",
      overview: "概览",
      jobs: "任务队列",
      opsMonitor: "运维监控",
      runtimeDownloads: "运行时下载",
      productionHealth: "生产健康",
      logs: "日志记录",
      systemConfig: "系统配置",
    },
    title: {
      admin: "管理",
      storage: "系统概览",
      modules: "接入模块",
    },
    topbar: {
      toggleNav: "切换导航",
      themeDarkTitle: "当前：深色模式（点击切换浅色）",
      themeLightTitle: "当前：浅色模式（点击切换跟随系统）",
      themeSystemTitle: "当前：跟随系统（点击切换深色）",
      themeDarkLabel: "深色模式",
      themeLightLabel: "浅色模式",
      themeSystemLabel: "跟随系统",
      languageZhTitle: "语言：简体中文（Click to switch English）",
      languageEnTitle: "Language: English（点击切换简体中文）",
      languageZhLabel: "语言 简体中文",
      languageEnLabel: "Language English",
      serverAvailable: "服务可用",
      serverUnavailable: "服务不可用",
    },
    drawer: {
      title: "控制台选项",
      preferences: "界面偏好",
      serviceDiscovery: "服务发现",
      users: "用户管理",
      modules: "模块管理",
      directories: "目录管理",
      preferencesTitle: "界面偏好",
      preferencesDescription: "控制台本地显示设置，保存到当前浏览器。",
      language: "语言",
      serviceId: "服务 ID",
      serviceLabel: "服务标签",
      bootstrapUrl: "引导地址",
      advertisedUrl: "对外服务地址",
      activeUrl: "活跃服务地址",
      forwardUrl: "转发目标地址",
      mode: "运行模式",
      configVersion: "配置版本",
      refreshSeconds: "刷新周期（秒）",
      checkInSeconds: "签到周期（秒）",
      offlineSeconds: "离线判定（秒）",
      saving: "保存中",
      saveDiscovery: "保存服务发现",
    },
  },
  en: {
    appTitle: "Pact Server Console",
    loading: "Initializing",
    connecting: "Connecting to server...",
    close: "Close",
    error: "Error",
    actions: {
      refresh: "Refresh",
      refreshPage: "Refresh This Page",
      refreshing: "Syncing",
      goImport: "Import files",
    },
    nav: {
      dashboard: "Workbench",
      feed: "Feed",
      approvalFlow: "Approvals",
      sources: "Data Sources",
      teamPanel: "Team Management",
      permissionGroups: "Permission Groups",
      workspaces: "Workspaces",
      devices: "Clients",
      knowledge: "Team Assets",
      knowledgeManagement: "Knowledge",
      wordCloud: "Vocabulary",
      knowledgeConfig: "Knowledge Settings",
      debugPanel: "Debug",
      knowledgeRecall: "Knowledge Recall",
      agentRetrieval: "Agent Retrieval",
      knowledgeDistillation: "Knowledge Distillation",
      agents: "Agents",
      skillHub: "Skill Hub",
      agentTools: "Skill Management",
      toolList: "Tool List",
      toolStats: "Tool Stats",
      maintenanceAgent: "Maintenance",
      agentConfig: "Agent Repository",
      contextManagement: "Context Management",
      systemStatus: "System Ops",
      overview: "Overview",
      jobs: "Jobs",
      opsMonitor: "Ops Monitor",
      runtimeDownloads: "Runtime Downloads",
      productionHealth: "Production Readiness",
      logs: "Logs",
      systemConfig: "System Settings",
    },
    title: {
      admin: "Admin",
      storage: "System Overview",
      modules: "Modules",
    },
    topbar: {
      toggleNav: "Toggle navigation",
      themeDarkTitle: "Dark mode. Click for light mode.",
      themeLightTitle: "Light mode. Click to follow system.",
      themeSystemTitle: "Following system. Click for dark mode.",
      themeDarkLabel: "Dark mode",
      themeLightLabel: "Light mode",
      themeSystemLabel: "System theme",
      languageZhTitle: "Language: Simplified Chinese (click for English)",
      languageEnTitle: "Language: English (click for Simplified Chinese)",
      languageZhLabel: "Language Simplified Chinese",
      languageEnLabel: "Language English",
      serverAvailable: "Server available",
      serverUnavailable: "Server unavailable",
    },
    drawer: {
      title: "Console Settings",
      preferences: "Preferences",
      serviceDiscovery: "Discovery",
      users: "Users",
      modules: "Modules",
      directories: "Directories",
      preferencesTitle: "Preferences",
      preferencesDescription: "Local display settings for this browser.",
      language: "Language",
      serviceId: "Service ID",
      serviceLabel: "Service Label",
      bootstrapUrl: "Bootstrap URL",
      advertisedUrl: "Advertised URL",
      activeUrl: "Active URL",
      forwardUrl: "Forward URL",
      mode: "Mode",
      configVersion: "Config Version",
      refreshSeconds: "Refresh Interval (s)",
      checkInSeconds: "Check-in Interval (s)",
      offlineSeconds: "Offline After (s)",
      saving: "Saving",
      saveDiscovery: "Save Discovery",
    },
  },
} as const;

export type ConsoleMessageKey = keyof typeof consoleMessages["zh-CN"];

type ConsolePhrasePair = readonly [zh: string, en: string];

type ConsolePatternPair = {
  zh: RegExp;
  en: (match: RegExpMatchArray) => string;
  enPattern: RegExp;
  zhBack: (match: RegExpMatchArray) => string;
};

const consolePhrasePairs: ConsolePhrasePair[] = [
  ["服务端控制台", "Server Console"],
  ["知识管理控制台", "Knowledge Console"],
  ["工作台", "Workbench"],
  ["信息流", "Feed"],
  ["审批流", "Approvals"],
  ["数据源", "Data Sources"],
  ["团队管理", "Team Management"],
  ["权限组", "Permission Groups"],
  ["工作空间", "Workspaces"],
  ["客户端", "Clients"],
  ["团队资产", "Team Assets"],
  ["知识库", "Knowledge Base"],
  ["知识管理", "Knowledge Management"],
  ["词汇库", "Vocabulary"],
  ["词云", "Word Cloud"],
  ["知识库配置", "Knowledge Settings"],
  ["调试面板", "Debug Panel"],
  ["知识召回", "Knowledge Recall"],
  ["智能检索", "Agent Retrieval"],
  ["智能体", "Agents"],
  ["技能库", "Skill Hub"],
  ["技能管理", "Skill Management"],
  ["智能巡检", "Inspection Agent"],
  ["智能体仓库", "Agent Repository"],
  ["模型网关", "Model Gateway"],
  ["大模型网关", "Model Gateway"],
  ["调用框架", "Invocation Framework"],
  ["外层工具调用", "Invocation Framework"],
  ["本地调用", "Local Invocation"],
  ["远程调用", "Remote Invocation"],
  ["上下文管理", "Context Management"],
  ["系统运维", "System Ops"],
  ["系统状态", "System Ops"],
  ["概览", "Overview"],
  ["任务队列", "Task Queue"],
  ["运维监控", "Ops Monitor"],
  ["生产健康", "Production Readiness"],
  ["日志记录", "Logs"],
  ["系统配置", "System Settings"],
  ["用户与执行日志", "Users and Audit Log"],
  ["用户创建和密码修改仅允许在服务端命令行执行。", "User creation and password changes are only allowed from the server CLI."],
  ["控制台用户", "Console Users"],
  ["控制台登录", "Console Login"],
  ["正在连接…", "Connecting..."],
  ["正在连接服务端…", "Connecting to server..."],
  ["正在确认登录状态，请稍候。", "Checking sign-in state. Please wait."],
  ["首次启动时服务端会自动创建 owner 并生成初始密码；账号创建和密码修改仅允许通过服务端命令行执行。", "On first startup the server creates the owner account and initial password. Account creation and password changes are only allowed from the server CLI."],
  ["用户名", "Username"],
  ["密码", "Password"],
  ["登录", "Sign In"],
  ["登录中", "Signing In"],
  ["关闭", "Close"],
  ["刷新", "Refresh"],
  ["刷新中", "Refreshing"],
  ["重新加载", "Reload"],
  ["重载模块", "Reload Modules"],
  ["重载中", "Reloading"],
  ["保存", "Save"],
  ["保存中", "Saving"],
  ["保存配置", "Save Settings"],
  ["保存失败", "Save Failed"],
  ["取消", "Cancel"],
  ["确认", "Confirm"],
  ["修改", "Edit"],
  ["删除", "Delete"],
  ["移除", "Remove"],
  ["导出", "Export"],
  ["复制", "Copy"],
  ["新增", "Add"],
  ["新增模型", "Add Model"],
  ["新增分组", "Add Group"],
  ["新增词语", "Add Term"],
  ["新会话", "New Session"],
  ["浏览", "Browse"],
  ["选择文件", "Select File"],
  ["选择文件夹", "Select Folder"],
  ["本地文件夹", "Local Folder"],
  ["一键全选", "Select All"],
  ["取消全选", "Clear All"],
  ["审批流", "Approvals"],
  ["统一处理 MCP 授权、知识入库冲突等需要人工决策的事项。", "Handle MCP authorization, knowledge-ingest conflicts, and other platform approvals in one place."],
  ["MCP 客户端授权", "MCP Client Authorization"],
  ["外部 MCP 客户端请求工具授权时，在这里统一批准或拒绝。", "Approve or reject tool requests from external MCP clients here."],
  ["没有待处理的授权请求", "No Pending Authorization Requests"],
  ["目前没有客户端发起新的 MCP 授权请求。", "No clients have submitted new MCP authorization requests."],
  ["知识入库冲突", "Knowledge Ingest Conflicts"],
  ["知识录入发现重复来源、路径内容冲突或结构化版本冲突时，在通用审批流统一决策。", "When knowledge ingest finds duplicate sources, path/content conflicts, or structured-version conflicts, decisions are handled in the general approval flow."],
  ["没有待处理的知识冲突", "No Pending Knowledge Conflicts"],
  ["知识入库当前没有等待人工决策的记录。", "There are no knowledge ingest records waiting for manual review."],
  ["报警", "Alerts"],
  ["没有报警", "No Alerts"],
  ["空配置、中断和后台巡检当前都没有需要处理的事项。", "Empty configuration, interruption, and background inspection currently have no items to handle."],
  ["邮件 / 文档", "Mail / Documents"],
  ["知识事务", "Knowledge Transactions"],
  ["客户端", "Clients"],
  ["在线", "Online"],
  ["离线", "Offline"],
  ["空闲", "Idle"],
  ["无客户端", "No Clients"],
  ["已就绪", "Ready"],
  ["待审批", "Pending Approval"],
  ["通过", "Passed"],
  ["超时", "Timed Out"],
  ["阻塞", "Blocked"],
  ["缺失", "Missing"],
  ["部分", "Partial"],
  ["预警", "Warning"],
  ["已批准", "Approved"],
  ["已拒绝", "Rejected"],
  ["已启用", "Enabled"],
  ["未启用", "Disabled"],
  ["启用", "Enable"],
  ["停用", "Disable"],
  ["开启", "On"],
  ["关闭", "Off"],
  ["已开启", "On"],
  ["已关闭", "Off"],
  ["可用", "Available"],
  ["不可用", "Unavailable"],
  ["未读取", "Not Loaded"],
  ["未设置", "Not Set"],
  ["未配置", "Not Configured"],
  ["未扫描", "Not Scanned"],
  ["未加载", "Not Loaded"],
  ["无", "None"],
  ["未知", "Unknown"],
  ["严重", "Critical"],
  ["高", "High"],
  ["普通", "Normal"],
  ["低", "Low"],
  ["状态", "Status"],
  ["用户", "User"],
  ["角色", "Role"],
  ["团队", "Team"],
  ["审批", "Approval"],
  ["操作", "Action"],
  ["结果", "Result"],
  ["时间", "Time"],
  ["类型", "Type"],
  ["名称", "Name"],
  ["备注", "Notes"],
  ["权限", "Permissions"],
  ["能力", "Capabilities"],
  ["文件", "Files"],
  ["大小", "Size"],
  ["最近任务", "Recent Jobs"],
  ["最近扫描", "Last Scan"],
  ["原文索引", "Source Index"],
  ["断点树", "Checkpoint Tree"],
  ["监听", "Watch"],
  ["自动下载", "Auto Download"],
  ["自动监听变化", "Watch Changes"],
  ["包含子目录", "Include Subfolders"],
  ["目录管理", "Directory Management"],
  ["目录名称", "Directory Name"],
  ["本地路径", "Local Path"],
  ["添加目录", "Add Directory"],
  ["添加中", "Adding"],
  ["填写服务端可访问的本地目录。目录变化后会自动整理并更新知识库，也可以手动同步。", "Enter local directories accessible to the server. Directory changes automatically trigger processing and knowledge updates, and can also be synced manually."],
  ["暂无目录", "No Directories"],
  ["添加一个服务端本地目录后，文件变化会自动触发整理任务。", "Add a server-local directory to automatically trigger processing when files change."],
  ["没有可显示的项目", "No Items to Display"],
  ["正在读取目录", "Reading Directory"],
  ["可以切换根目录、上一级目录，或显示隐藏项。", "You can switch root directories, move up one level, or show hidden items."],
  ["显示隐藏项", "Show Hidden Items"],
  ["原始文件", "Source Files"],
  ["来源定位", "Source Location"],
  ["证据预览", "Evidence Preview"],
  ["证据无法打开", "Evidence Unavailable"],
  ["正在加载证据", "Loading Evidence"],
  ["正在打开来源。", "Opening Source."],
  ["没有证据内容", "No Evidence Content"],
  ["暂未选择来源。", "No source selected."],
  ["请稍候。", "Please wait."],
  ["权限不足", "Insufficient Permission"],
  ["需要 auth:admin 权限才能管理用户、OIDC、会话和操作记录。", "The auth:admin permission is required to manage users, OIDC, sessions, and operation logs."],
  ["OIDC 配置", "OIDC Settings"],
  ["会话与操作记录", "Sessions and Operation Log"],
  ["会话", "Sessions"],
  ["模块管理", "Module Management"],
  ["模块路径", "Module Path"],
  ["运行状态", "Runtime Status"],
  ["运行实例", "Runtime Instance"],
  ["当前模型库为空，请点击前往配置模型/智能体。", "The model library is empty. Go configure models or agents first."],
  ["当前模型库为空，请先配置模型/智能体。", "The model library is empty. Configure models or agents first."],
  ["未分配智能体", "No Agent Assigned"],
  ["未选择智能体", "No Agent Selected"],
  ["当前模型库为空。", "The model library is empty."],
  ["模型库", "Model Library"],
  ["通用智能体", "General Agent"],
  ["智能体名称", "Agent Name"],
  ["模型 ID", "Model ID"],
  ["功能可见性与授权", "Feature Visibility and Authorization"],
  ["被引用的功能", "Referenced Features"],
  ["智能体提示词与调用参数", "Agent Prompts and Invocation Parameters"],
  ["探测", "Probe"],
  ["探测中", "Probing"],
  ["等待中", "Waiting"],
  ["连接 Codex", "Connect Codex"],
  ["留空则保留当前已配置 Key", "Leave blank to keep the configured key"],
  ["留空则保留当前已配置 Token", "Leave blank to keep the configured token"],
  ["已绑定", "Bound"],
  ["已连接", "Connected"],
  ["需要连接 Codex OAuth。", "Codex OAuth must be connected."],
  ["本地命令模板 JSON", "Local Command Template JSON"],
  ["function call schema", "Function Call Schema"],
  ["JSON 解析失败。", "JSON parse failed."],
  ["保存失败。", "Save failed."],
  ["本地命令模板必须是 JSON 数组。", "Local command templates must be a JSON array."],
  ["function call schema 必须是 JSON 对象。", "Function call schema must be a JSON object."],
  ["工具调用配置", "Tool Invocation Settings"],
  ["保存工具调用配置", "Save Tool Invocation Settings"],
  ["启用 HTTP 工具", "Enable HTTP Tools"],
  ["HTTP 允许 Host (逗号分隔)", "HTTP Allowed Hosts (comma-separated)"],
  ["HTTP 允许 Host（逗号分隔）", "HTTP Allowed Hosts (comma-separated)"],
  ["HTTP 最大响应字节", "HTTP Max Response Bytes"],
  ["启用本地命令工具", "Enable Local Command Tools"],
  ["命令 Timeout(ms)", "Command Timeout (ms)"],
  ["命令最大输出字节", "Command Max Output Bytes"],
  ["本地命令模板", "Local Command Templates"],
  ["激活 (active)", "Active"],
  ["调用框架", "Invocation Framework"],
  ["知识召回", "Knowledge Recall"],
  ["只调试底层知识召回，不调用大模型。适合检查融合策略、学习开关和证据可读性。", "Debug low-level knowledge recall without calling an LLM. Use this to inspect fusion strategy, learning flags, and evidence readability."],
  ["召回问题", "Recall Query"],
  ["知识库", "Knowledge Base"],
  ["召回模式", "Recall Mode"],
  ["仅关键词", "Keyword Only"],
  ["启用学习", "Enable Learning"],
  ["返回解释", "Return Explanation"],
  ["执行召回", "Run Recall"],
  ["召回中", "Recalling"],
  ["正在召回。", "Recalling."],
  ["没有召回结果。", "No recall results."],
  ["原始响应", "Raw Response"],
  ["智能检索", "Agent Retrieval"],
  ["调试智能体如何规划工具调用、压缩上下文、打开证据并生成最终回答。", "Debug how the agent plans tool calls, compresses context, opens evidence, and produces the final answer."],
  ["智能检索会话", "Agent Retrieval Sessions"],
  ["关闭标签", "Close Tab"],
  ["问题", "Question"],
  ["上下文窗口", "Context Window"],
  ["循环轮数", "Iterations"],
  ["每次召回", "Recall Limit"],
  ["开始检索", "Start Retrieval"],
  ["检索中", "Retrieving"],
  ["检索进度", "Retrieval Progress"],
  ["历史会话", "History Sessions"],
  ["工具轨迹", "Tool Trace"],
  ["模型正在选择本地工具。", "The model is selecting local tools."],
  ["工具调用中，等待返回。", "Tool call in progress, waiting for response."],
  ["上下文", "Context"],
  ["检索结果", "Retrieval Results"],
  ["复制文档", "Copy Document"],
  ["导出 Markdown", "Export Markdown"],
  ["等待结果", "Waiting for Results"],
  ["模型会调用本地工具检索，再决定是否打开证据。", "The model will call local tools to retrieve results, then decide whether to open evidence."],
  ["引用证据", "Referenced Evidence"],
  ["上下文包", "Context Pack"],
  ["运行结构", "Run Structure"],
  ["降级", "Degraded"],
  ["知识入库", "Knowledge Ingest"],
  ["入库目标", "Ingest Targets"],
  ["全局知识空间", "Global Knowledge Space"],
  ["外部知识库", "External Knowledge Base"],
  ["团队空间", "Team Space"],
  ["用户私有空间", "User Private Space"],
  ["平台级共享知识，面向具备权限的团队、用户和智能体使用。", "Platform-shared knowledge available to authorized teams, users, and agents."],
  ["同步到 Dify、RAGFlow 等外部知识库空间。", "Sync to external knowledge spaces such as Dify and RAGFlow."],
  ["指定一个或多个团队可见，团队权限继续作为上限。", "Make it visible to one or more teams; team permissions remain the upper bound."],
  ["仅给指定用户独立使用，可多选用户。", "Use only for selected users; multiple users can be selected."],
  ["生成文档", "Generate Document"],
  ["知识库页面已空", "Knowledge page is empty"],
  ["请重新选择左侧“知识库”下的任一标签。", "Select a tab under Knowledge Base in the left navigation."],
  ["当前知识标签异常，已切回默认标签。", "The current knowledge tab is invalid and has been reset."],
  ["内建 KnowledgeCore 和外部知识库都作为可选后端提供，按卡片顺序配置。", "Built-in KnowledgeCore and external knowledge bases are available as selectable backends and configured in card order."],
  ["内建知识库 / Pact KnowledgeCore", "Built-in Knowledge Base / Pact KnowledgeCore"],
  ["这是平台内建知识库，承载统一入库、索引、证据读取、权限和审计链路。", "This is the platform built-in knowledge base for unified ingest, indexing, evidence reading, permissions, and audit trails."],
  ["后端知识库配置", "Backend Knowledge Base Settings"],
  ["高级参数", "Advanced Parameters"],
  ["外部库类型", "External Base Type"],
  ["连接模式", "Connection Mode"],
  ["库 / 空间 ID", "Base / Space ID"],
  ["刷新外部空间", "Refresh External Spaces"],
  ["刷新全部", "Refresh All"],
  ["强制刷新", "Force Refresh"],
  ["知识", "Knowledge"],
  ["规则", "Rules"],
  ["知识管理", "Knowledge Management"],
  ["邮件专家规则", "Mail Expert Rules"],
  ["报告序列", "Report Series"],
  ["同义词", "Synonyms"],
  ["专家词汇规则", "Expert Vocabulary Rules"],
  ["用于知识分类、事务归纳和检索提示。Toggle 控制词条是否作为 active 专家规则参与运行。", "Used for knowledge classification, transaction summarization, and retrieval prompts. The toggle controls whether entries run as active expert rules."],
  ["筛选词条", "Filter Terms"],
  ["词语", "Term"],
  ["暂无词条", "No Terms"],
  ["规则名称", "Rule Name"],
  ["创建规则", "Create Rule"],
  ["机器可读配置", "Machine-Readable Config"],
  ["黄金规则", "Golden Rules"],
  ["暂无黄金规则包", "No Golden Rule Packages"],
  ["只在需要精确修改服务端配置对象时展开", "Expand only when you need to edit the exact server configuration object."],
  ["智能体分组", "Agent Groups"],
  ["审批", "Approvals"],
  ["用户策略", "User Policies"],
  ["智能体绑定", "Agent Bindings"],
  ["统一权限治理", "Unified Permission Governance"],
  ["团队权限作为上限, 用户策略与审批, 智能体绑定与分组共同形成最终裁决.", "Team permissions are the upper bound. User policies, approvals, agent bindings, and groups form the final decision."],
  ["团队权限作为上限，用户策略与审批，智能体绑定与分组共同形成最终裁决。", "Team permissions are the upper bound. User policies, approvals, agent bindings, and groups form the final decision."],
  ["接口不存在: /api/authorization/governance", "Endpoint missing: /api/authorization/governance"],
  ["对象", "Object"],
  ["配置", "Settings"],
  ["重置模板", "Reset Template"],
  ["暂无角色", "No Roles"],
  ["暂无团队", "No Teams"],
  ["暂无用户策略", "No User Policies"],
  ["暂无智能体绑定", "No Agent Bindings"],
  ["暂无智能体分组", "No Agent Groups"],
  ["暂无审批", "No Approvals"],
  ["权限组", "Permission Groups"],
  ["权限组是全系统权限配置入口; 团队策略, 用户策略, 智能体绑定, 工具授权和单工具例外只在这里维护.", "Permission groups are the system-wide permission entry. Team policies, user policies, agent bindings, tool grants, and per-tool exceptions are maintained here."],
  ["权限组是全系统权限配置入口；团队策略、用户策略、智能体绑定、工具授权和单工具例外只在这里维护。", "Permission groups are the system-wide permission entry. Team policies, user policies, agent bindings, tool grants, and per-tool exceptions are maintained here."],
  ["生成默认组", "Generate Default Groups"],
  ["新增权限组", "Add Permission Group"],
  ["保存权限组", "Save Permission Groups"],
  ["权限层levels", "Permission Layers"],
  ["权限层 levels", "Permission Layers"],
  ["工具集", "Toolsets"],
  ["工具", "Tools"],
  ["预设组", "Preset Groups"],
  ["暂无权限组", "No Permission Groups"],
  ["先生成默认组或新增自定义权限组.", "Generate default groups or add a custom permission group first."],
  ["先生成默认组或新增自定义权限组。", "Generate default groups or add a custom permission group first."],
  ["全部用户", "All Users"],
  ["全部智能体", "All Agents"],
  ["无团队", "No Team"],
  ["无成员", "No Members"],
  ["无分组", "No Group"],
  ["未绑定用户", "No Bound User"],
  ["保存权限组失败。", "Failed to save permission groups."],
  ["读取统一权限治理失败。", "Failed to load unified permission governance."],
  ["自定义权限组", "Custom Permission Group"],
  ["按权限层级和工具明细定义智能体可调用范围。", "Define agent callable scope by permission layer and tool details."],
  ["工作空间详情", "Workspace Details"],
  ["会话线程", "Session Threads"],
  ["可继续会话", "Continuable Sessions"],
  ["主会话", "Main Session"],
  ["分叉", "Fork"],
  ["配置 Profile", "Configure Profile"],
  ["设置继承", "Set Inheritance"],
  ["本机目录", "Local Directory"],
  ["云盘", "Cloud Drive"],
  ["代码库", "Repository"],
  ["共享", "Sharing"],
  ["展开工作空间详情", "Expand Workspace Details"],
  ["收起工作空间详情", "Collapse Workspace Details"],
  ["新建工作空间", "New Workspace"],
  ["创建后可设置继承关系和 profile 来复用其他工作空间的知识库与配置。", "After creation, inheritance and profile settings can reuse knowledge bases and configuration from other workspaces."],
  ["从左侧选择一个工作空间", "Select a workspace from the left"],
  ["或点击\"新建工作空间\"。", "Or click \"New Workspace\"."],
  ["移除工作空间", "Remove Workspace"],
  ["确认移除", "Confirm Removal"],
  ["同时从文件系统中彻底删除物理文件夹及所有快照数据", "Also permanently delete physical folders and all snapshot data from the file system"],
  ["配置并管理所有的本地或外部数据来源。", "Configure and manage all local or external data sources."],
  ["按客户端上报状态和运行时调用统计展示连接情况。", "Show connection status from client reporting and runtime call statistics."],
  ["添加数据源", "Add Data Source"],
  ["先选择数据源类型，再填写该类型需要的配置。", "Select a data source type first, then fill in the configuration required for that type."],
  ["数据源类型", "Data Source Type"],
  ["请选择数据源类型", "Select a data source type"],
  ["本地目录", "Local Directory"],
  ["客户端接入", "Client Connection"],
  ["客户端无需在这里创建固定记录。客户端完成接入并上报后，会自动出现在客户端列表和请求统计表中。", "Clients do not need a fixed record here. After a client connects and reports, it appears automatically in the client list and request statistics."],
  ["点击右上角「添加数据源」后，按类型填写对应配置。", "Click Add Data Source in the upper-right corner, then fill in the configuration for the selected type."],
  ["请求 / 分钟", "Requests / Min"],
  ["总请求", "Total Requests"],
  ["最近上报", "Last Reported"],
  ["最近窗口", "Recent Window"],
  ["累计请求", "Total Calls"],
  ["暂无客户端请求记录", "No Client Request Records"],
  ["客户端上报后会在这里展示每分钟请求量。", "Requests per minute will appear here after clients report."],
  ["查看客户端", "View Clients"],
  ["暂无本地数据源", "No Local Data Sources"],
  ["点击右上角「添加本地目录」后，文件变化会自动触发整理任务。", "Click Add Local Directory in the upper-right corner to automatically trigger processing when files change."],
  ["高级选项", "Advanced Options"],
  ["信息流", "Feed"],
  ["输入问题后，会同时启动原文检索和智能规划，最后由总结智能体合并结果。", "After entering a question, source retrieval and intelligent planning run in parallel, then the summary agent merges the results."],
  ["需要选择可用智能体", "Available Agent Required"],
  ["原文检索", "Source Retrieval"],
  ["智能规划", "Intelligent Planning"],
  ["附件处理", "Attachment Processing"],
  ["总结智能体", "Summary Agent"],
  ["输出报告", "Output Report"],
  ["兜底摘要", "Fallback Summary"],
  ["需要确认", "Needs Confirmation"],
  ["人类专家意见", "Human Expert Opinion"],
  ["上下文门禁", "Context Gate"],
  ["高级选项", "Advanced Options"],
  ["系统提示词", "System Prompt"],
  ["工具策略提示词", "Tool Policy Prompt"],
  ["继续轮次提示词", "Continuation Prompt"],
  ["答案模板", "Answer Template"],
  ["默认循环轮数", "Default Iterations"],
  ["默认每次召回", "Default Recall Limit"],
  ["配置用于信息流智能检索、知识融合和总结前置检索的默认参数。", "Configure defaults for feed agent retrieval, knowledge fusion, and summary pre-retrieval."],
  ["运维监控", "Ops Monitor"],
  ["客户端热力图", "Client Heatmap"],
  ["影响", "Impact"],
  ["处理", "Action"],
  ["补充", "Note"],
  ["进程状态", "Process Status"],
  ["监控报警", "Monitoring Alerts"],
  ["报警报文配置 JSON", "Alert Payload Config JSON"],
  ["生产健康", "Production Readiness"],
  ["日志记录", "Logs"],
  ["后台报警", "Background Alert"],
  ["后台 Worker 管理进程离线", "Background Worker Manager Offline"],
  ["后台 Worker 管理进程", "Background Worker Manager"],
  ["导入解析 Worker", "Import Parser Worker"],
  ["目录同步 Worker", "Directory Sync Worker"],
  ["智能巡检 Worker", "Inspection Agent Worker"],
  ["智能体 Worker", "Agent Worker"],
  ["系统巡检", "System Inspection"],
  ["空配置报警", "Empty Configuration Alert"],
  ["查看报警", "View Alert"],
  ["确认关闭", "Acknowledge"],
  ["未配置智能体", "No Agent Configured"],
  ["去配置", "Configure"],
  ["服务 ID", "Service ID"],
  ["对外服务地址", "Advertised Service URL"],
  ["活跃服务地址", "Active Service URL"],
  ["当前会话", "Current Session"],
  ["退出登录", "Sign Out"],
  ["模型默认", "Model Default"],
  ["复杂检索和多轮证据", "Complex retrieval and multi-round evidence"],
  ["历史记录", "History"],
  ["暂无历史记录", "No History"],
  ["附件", "Attachments"],
  ["开始信息流", "Start Feed"],
  ["列表操作", "List Actions"],
  ["选择操作", "Select Action"],
  ["Pact 内置知识库, 承载统一入库, 索引, 证据和全平台审批后的知识.", "Pact built-in knowledge base for unified ingest, indexing, evidence, and knowledge approved by platform workflows."],
  ["Pact 内置知识库，承载统一入库、索引、证据和全平台审批后的知识。", "Pact built-in knowledge base for unified ingest, indexing, evidence, and knowledge approved by platform workflows."],
  ["内部", "Internal"],
  ["外部", "External"],
  ["协议", "Protocol"],
  ["受管目录", "Managed Directories"],
  ["可用能力", "Available Capabilities"],
  ["已验证", "Verified"],
  ["将入库到: 全局知识空间", "Ingesting to: Global Knowledge Space"],
  ["将入库到：全局知识空间", "Ingesting to: Global Knowledge Space"],
  ["开始入库", "Start Ingest"],
  ["预览解析", "Preview Parsing"],
  ["选择文件并配置入库目标后, 处理进度会显示在这里.", "After selecting files and configuring ingest targets, progress will appear here."],
  ["选择文件并配置入库目标后，处理进度会显示在这里。", "After selecting files and configuring ingest targets, progress will appear here."],
  ["内建", "Built-in"],
  ["检索融合", "Retrieval Fusion"],
  ["BM25 权重", "BM25 Weight"],
  ["向量权重", "Vector Weight"],
  ["图片权重", "Image Weight"],
  ["图谱提示权重", "Graph Hint Weight"],
  ["反馈提升权重", "Feedback Boost Weight"],
  ["时间新鲜度权重", "Time Freshness Weight"],
  ["按指数半衰期为更近的资料提供轻量排序加成, 0 表示关闭.", "Use exponential half-life to lightly boost more recent material. 0 disables it."],
  ["按指数半衰期为更近的资料提供轻量排序加成，0 表示关闭。", "Use exponential half-life to lightly boost more recent material. 0 disables it."],
  ["时间新鲜度半衰期 (天)", "Time Freshness Half-Life (days)"],
  ["指数衰减参数: 资料年龄达到该天数时, 新鲜度分约降为 50%.", "Exponential decay parameter: when material age reaches this number of days, freshness score drops to about 50%."],
  ["指数衰减参数：资料年龄达到该天数时，新鲜度分约降为 50%。", "Exponential decay parameter: when material age reaches this number of days, freshness score drops to about 50%."],
  ["新鲜度最低保留", "Minimum Freshness Retention"],
  ["避免旧资料被时间因子完全压制, 只影响排序, 不删除或屏蔽知识.", "Prevents older material from being fully suppressed by time. It only affects ranking and does not delete or hide knowledge."],
  ["避免旧资料被时间因子完全压制，只影响排序，不删除或屏蔽知识。", "Prevents older material from being fully suppressed by time. It only affects ranking and does not delete or hide knowledge."],
  ["父级扩展深度", "Parent Expansion Depth"],
  ["启用分层索引", "Enable Hierarchical Index"],
  ["分层路径权重", "Hierarchical Path Weight"],
  ["粗层候选分支数", "Coarse Candidate Branches"],
  ["分层回退片段数", "Hierarchical Fallback Snippets"],
  ["分支最少细候选数", "Minimum Fine Candidates per Branch"],
  ["进化学习", "Evolutionary Learning"],
  ["已接入反馈学习闭环, 控制检索 profile 的候选生成, 评估, 灰度和自动发布边界.", "Connected to the feedback learning loop. Controls candidate generation, evaluation, rollout, and auto-publish boundaries for retrieval profiles."],
  ["已接入反馈学习闭环，控制检索 profile 的候选生成、评估、灰度和自动发布边界。", "Connected to the feedback learning loop. Controls candidate generation, evaluation, rollout, and auto-publish boundaries for retrieval profiles."],
  ["启用学习闭环", "Enable Learning Loop"],
  ["自动发布检索 profile", "Auto-Publish Retrieval Profile"],
  ["反馈窗口小时数", "Feedback Window (hours)"],
  ["智能体工作空间", "Agent Workspaces"],
  ["主线", "Mainline"],
  ["事件", "Events"],
  ["知识源", "Knowledge Sources"],
  ["OpenCode MCP 创建的共享工作空间", "Shared workspace created by OpenCode MCP"],
  ["通过控制台签发的正式 grant token 创建的工作空间", "Workspace created with a formal grant token issued by the console"],
  ["通过 OpenCode + Pact MCP 创建的公共工作空间, 用于测试文件互通和知识协作", "Public workspace created through OpenCode + Pact MCP for testing file exchange and knowledge collaboration"],
  ["通过 OpenCode + Pact MCP 创建的公共工作空间，用于测试文件互通和知识协作", "Public workspace created through OpenCode + Pact MCP for testing file exchange and knowledge collaboration"],
  ["刷新进程", "Refresh Processes"],
  ["刷新热力图", "Refresh Heatmap"],
  ["刷新报警", "Refresh Alerts"],
  ["暂无客户端运行时热度", "No Client Runtime Heat"],
  ["带 clientUid 的标准调用进入协议层后会在这里出现.", "Standard calls with clientUid appear here after entering the protocol layer."],
  ["带 clientUid 的标准调用进入协议层后会在这里出现。", "Standard calls with clientUid appear here after entering the protocol layer."],
  ["冷却", "Cooling"],
  ["热", "Hot"],
  ["进程", "Processes"],
  ["PID", "PID"],
  ["最后响应时间", "Last Response"],
  ["暂无进程状态", "No Process Status"],
  ["保存报警配置", "Save Alert Settings"],
  ["级别", "Severity"],
  ["当前可用的导入, 解析与索引能力.", "Currently available ingest, parsing, and indexing capabilities."],
  ["当前可用的导入、解析与索引能力。", "Currently available ingest, parsing, and indexing capabilities."],
  ["活跃任务", "Active Jobs"],
  ["运行中", "Running"],
  ["排队", "Queued"],
  ["存储批次", "Storage Batches"],
  ["邮件", "Mail"],
  ["事务", "Transactions"],
  ["待关注", "Needs Attention"],
  ["任务, 设备或服务状态需要处理.", "Jobs, devices, or service states need attention."],
  ["任务、设备或服务状态需要处理。", "Jobs, devices, or service states need attention."],
  ["原始对象", "Raw Objects"],
  ["线程", "Threads"],
  ["人物", "People"],
  ["检索项", "Search Items"],
  ["批次", "Batches"],
  ["查看接入模块", "View Modules"],
  ["运行档位", "Runtime Profile"],
  ["挂载代次", "Mount Generation"],
  ["挂载模块", "Mounted Modules"],
  ["引导网络", "Discovery Network"],
  ["风险", "Risk"],
  ["调度策略", "Scheduling Policy"],
  ["自动批准", "Auto Approval"],
  ["Tick 秒", "Tick Seconds"],
  ["计划", "Schedule"],
  ["间隔", "Interval"],
  ["每小时健康巡检", "Hourly Health Inspection"],
  ["每日存储与知识库维护", "Daily Storage and Knowledge Maintenance"],
  ["每日失败任务复盘", "Daily Failed-Job Review"],
  ["保存策略", "Save Policy"],
  ["对话入口", "Chat Entry"],
  ["默认智能体", "Default Agent"],
  ["巡检智能体", "Inspection Agent"],
  ["指令", "Instruction"],
  ["发送", "Send"],
  ["选择", "Select"],
  ["健康冒烟巡检 / health_smoke", "Health Smoke Inspection / health_smoke"],
  ["运行", "Run"],
  ["知识库维护巡检", "Knowledge Maintenance Inspection"],
  ["知识库维护任务已收敛到智能巡检, 运行后进入记录, 审批和审计链路.", "Knowledge maintenance tasks have moved into Inspection Agent. After running, they enter records, approvals, and audit trails."],
  ["知识库维护任务已收敛到智能巡检，运行后进入记录、审批和审计链路。", "Knowledge maintenance tasks have moved into Inspection Agent. After running, they enter records, approvals, and audit trails."],
  ["运行记录", "Run Records"],
  ["暂无维护运行", "No Maintenance Runs"],
  ["信息流智能体", "Feed Agent"],
  ["信息流最终报告需要一个可用智能体来融合原文检索, 智能规划和附件结果.", "The final feed report needs an available agent to merge source retrieval, intelligent planning, and attachment results."],
  ["信息流最终报告需要一个可用智能体来融合原文检索、智能规划和附件结果。", "The final feed report needs an available agent to merge source retrieval, intelligent planning, and attachment results."],
  ["知识检索智能体", "Knowledge Retrieval Agent"],
  ["智能检索需要一个可用智能体来规划工具调用和打开证据.", "Agent retrieval needs an available agent to plan tool calls and open evidence."],
  ["智能检索需要一个可用智能体来规划工具调用和打开证据。", "Agent retrieval needs an available agent to plan tool calls and open evidence."],
  ["创建规则智能体", "Rule Authoring Agent"],
  ["创建规则的智能对话模式需要一个可用智能体辅助生成规则草稿.", "The conversational rule-authoring mode needs an available agent to draft rules."],
  ["创建规则的智能对话模式需要一个可用智能体辅助生成规则草稿。", "The conversational rule-authoring mode needs an available agent to draft rules."],
  ["知识融合智能体", "Knowledge Fusion Agent"],
  ["知识融合分析需要显式绑定一个可用智能体, 用于合并多路知识证据与结构化结果.", "Knowledge fusion analysis must explicitly bind an available agent to merge knowledge evidence and structured results."],
  ["知识融合分析需要显式绑定一个可用智能体，用于合并多路知识证据与结构化结果。", "Knowledge fusion analysis must explicitly bind an available agent to merge knowledge evidence and structured results."],
  ["文档分类智能体", "Document Classification Agent"],
  ["邮件和文档进入图谱前的领域, 关键词和意图分类.", "Domain, keyword, and intent classification before mail and documents enter the graph."],
  ["邮件和文档进入图谱前的领域、关键词和意图分类。", "Domain, keyword, and intent classification before mail and documents enter the graph."],
  ["知识图谱智能体", "Knowledge Graph Agent"],
  ["节点聚合, 关系解释和高频实体抽象.", "Node aggregation, relationship interpretation, and high-frequency entity abstraction."],
  ["节点聚合、关系解释和高频实体抽象。", "Node aggregation, relationship interpretation, and high-frequency entity abstraction."],
  ["时序提炼智能体", "Temporal Distillation Agent"],
  ["围绕具体事务提炼阶段, 事件和关键节点.", "Distill stages, events, and key milestones around specific transactions."],
  ["围绕具体事务提炼阶段、事件和关键节点。", "Distill stages, events, and key milestones around specific transactions."],
  ["智能体工具调用", "Agent Tool Invocation"],
  ["智能体可使用服务端工具的权限范围, 不需要单独绑定智能体.", "Permission scope for agents to use server-side tools; no separate agent binding is required."],
  ["智能体可使用服务端工具的权限范围，不需要单独绑定智能体。", "Permission scope for agents to use server-side tools; no separate agent binding is required."],
  ["所有", "All"],
  ["已解决", "Resolved"],
  ["已忽略", "Ignored"],
  ["全部", "All"],
  ["添加本地目录", "Add Local Directory"],
  ["活跃服务", "Active Service"],
  ["模式", "Mode"],
  ["草稿", "Draft"],
  ["上下文编译器", "Context Compiler"],
  ["导出记录", "Export Records"],
  ["窗口", "Window"],
  ["历史", "History"],
  ["专家权重", "Expert Weight"],
  ["保护字段: evidenceId, sourceLocator, snippet, who, what, when", "Protected fields: evidenceId, sourceLocator, snippet, who, what, when"],
  ["保护字段：evidenceId, sourceLocator, snippet, who, what, when", "Protected fields: evidenceId, sourceLocator, snippet, who, what, when"],
  ["模型压缩: 关闭", "Model compression: off"],
  ["模型压缩：关闭", "Model compression: off"],
  ["预览任务", "Preview Task"],
  ["必须保留的 evidenceId", "Required evidenceId"],
  ["预览 ContextPack", "Preview ContextPack"],
  ["运行 Replay 评估", "Run Replay Evaluation"],
  ["最近上下文编译记录", "Recent Context Build Records"],
  ["暂无上下文编译记录.", "No context build records."],
  ["暂无上下文编译记录。", "No context build records."],
  ["自动调参最少反馈数", "Minimum Feedback for Auto-Tuning"],
  ["激活前必须离线评估", "Require Offline Evaluation Before Activation"],
  ["启用检索策略灰度", "Enable Retrieval Strategy Rollout"],
  ["默认灰度流量百分比", "Default Rollout Traffic Percent"],
  ["维护策略", "Maintenance Policy"],
  ["重建批大小", "Rebuild Batch Size"],
  ["过期索引小时数", "Stale Index Hours"],
  ["图片必须带 OCR 或说明", "Images Require OCR or Description"],
  ["模型版本", "Model Version"],
  ["文本 provider", "Text Provider"],
  ["图片 provider", "Image Provider"],
  ["高级 JSON Diff", "Advanced JSON Diff"],
  ["Dify 后端知识库", "Dify Backend Knowledge Base"],
  ["Dify 可作为 Pact 的外部后端知识库, 按派生空间暴露给召回和入库链路.", "Dify can serve as an external Pact backend knowledge base and expose derived spaces to recall and ingest flows."],
  ["可选后端", "Optional Backend"],
  ["RAGFlow 后端知识库", "RAGFlow Backend Knowledge Base"],
  ["RAGFlow 可作为 Pact 的外部后端知识库, 按派生空间暴露给召回和入库链路.", "RAGFlow can serve as an external Pact backend knowledge base and expose derived spaces to recall and ingest flows."],
  ["保存内建Knowledge Settings", "Save Built-in Knowledge Settings"],
  ["KnowledgeCore 可用", "KnowledgeCore Available"],
  ["KnowledgeCore 未启用", "KnowledgeCore Disabled"],
  ["生产健康", "Production Readiness"],
  ["汇总生产准入报告, 质量门禁, 运行时治理, 权限安全, 备份恢复和发版连续性状态.", "Summarizes production readiness reports, quality gates, runtime governance, permission security, backup recovery, and release continuity."],
  ["汇总生产准入报告、质量门禁、运行时治理、权限安全、备份恢复和发版连续性状态。", "Summarizes production readiness reports, quality gates, runtime governance, permission security, backup recovery, and release continuity."],
  ["生产准入", "Readiness Gates"],
  ["架构, 真实解析, UI smoke 和离线包能否支撑发版.", "Checks whether architecture, real parsing, UI smoke, and offline packages can support release."],
  ["架构、真实解析、UI smoke 和离线包能否支撑发版。", "Checks whether architecture, real parsing, UI smoke, and offline packages can support release."],
  ["知识质量", "Knowledge Quality"],
  ["外部知识库一致性, RAG 检索和蒸馏质量是否持续达标.", "Checks whether external knowledge-base consistency, RAG retrieval, and distillation quality remain healthy."],
  ["外部知识库一致性、RAG 检索和蒸馏质量是否持续达标。", "Checks whether external knowledge-base consistency, RAG retrieval, and distillation quality remain healthy."],
  ["智能体运行时", "Agent Runtime"],
  ["会话线程, 长任务工作流和终端贡献资产治理是否闭环.", "Checks whether session threads, durable workflows, and terminal-contributed asset governance are closed-loop."],
  ["会话线程、长任务工作流和终端贡献资产治理是否闭环。", "Checks whether session threads, durable workflows, and terminal-contributed asset governance are closed-loop."],
  ["权限安全", "Permission Security"],
  ["AgentLibrary 源头权限, 工具授权和控制台安全边界是否有效.", "Checks whether AgentLibrary source permissions, tool grants, and console security boundaries are effective."],
  ["AgentLibrary 源头权限、工具授权和控制台安全边界是否有效。", "Checks whether AgentLibrary source permissions, tool grants, and console security boundaries are effective."],
  ["可观测性", "Observability"],
  ["内部 Trace, 运行时日志和脱敏链路是否可用于问题定位.", "Checks whether internal traces, runtime logs, and redaction flows can support incident diagnosis."],
  ["内部 Trace、运行时日志和脱敏链路是否可用于问题定位。", "Checks whether internal traces, runtime logs, and redaction flows can support incident diagnosis."],
  ["连续性", "Continuity"],
  ["备份恢复, Checkpoint, 升级迁移和配置迁移是否可演练.", "Checks whether backup recovery, checkpoints, upgrade migration, and configuration migration can be rehearsed."],
  ["备份恢复、Checkpoint、升级迁移和配置迁移是否可演练。", "Checks whether backup recovery, checkpoints, upgrade migration, and configuration migration can be rehearsed."],
  ["生成生产准入报告", "Generate Production Readiness Report"],
  ["重新执行完整生产准入", "Rerun Full Production Readiness"],
  ["执行快速生产准入", "Run Quick Production Readiness"],
  ["通过门禁", "Passed Gates"],
  ["失败门禁", "Failed Gates"],
  ["超时门禁", "Timed-out Gates"],
  ["P0 阻塞", "P0 Blockers"],
  ["读取失败", "Read Failed"],
  ["报告目录", "Report Directory"],
  ["分支", "Branch"],
  ["提交", "Commit"],
  ["脏文件", "Dirty Files"],
  ["权限内核", "Permission Kernel"],
  ["权限状态", "Permission Status"],
  ["权限绑定", "Permission Bindings"],
  ["恢复能力", "Recovery Capability"],
  ["绑定守卫", "Binding Guard"],
  ["绑定状态", "Binding Status"],
  ["v0.0.1 基线", "v0.0.1 Baseline"],
  ["展示单机运行基线, 五类 MCP 出口和本地通用切面状态.", "Shows the single-machine runtime baseline, five MCP outlets, and local common-port status."],
  ["展示单机运行基线、五类 MCP 出口和本地通用切面状态。", "Shows the single-machine runtime baseline, five MCP outlets, and local common-port status."],
  ["基线状态", "Baseline Status"],
  ["协议版本", "Protocol Version"],
  ["验证模式", "Verification Mode"],
  ["等待加载", "Pending Load"],
  ["MCP 出口", "MCP Outlets"],
  ["通用切面", "Common Ports"],
  ["状态语义", "State Semantics"],
  ["Secret 模式", "Secret Mode"],
  ["运行配置", "Runtime Config"],
  ["外部状态", "External State"],
  ["覆盖缺口", "Coverage Gaps"],
  ["门禁通过", "Gates Passed"],
  ["门禁明细", "Gate Details"],
  ["门禁", "Gate"],
  ["负责人", "Owner"],
  ["命令", "Command"],
  ["证据和下一步", "Evidence and Next Step"],
  ["未通过", "Failed"],
  ["未分级", "Unclassified"],
  ["未声明", "Unassigned"],
  ["无覆盖声明", "No Coverage Declaration"],
  ["无证据路径", "No Evidence Path"],
  ["已闭环", "Closed"],
  ["暂无生产准入报告", "No Production Readiness Report"],
  ["执行生产准入 verifier 后会在这里显示最新门禁.", "After running the production readiness verifier, the latest gates will appear here."],
  ["执行生产准入 verifier 后会在这里显示最新门禁。", "After running the production readiness verifier, the latest gates will appear here."],
  ["报告历史", "Report History"],
  ["没有历史报告", "No Historical Reports"],
  ["执行入口", "Run Entry Points"],
  ["无报告", "No Report"],
  ["未生成", "Not Generated"],
  ["架构门禁", "Architecture Gate"],
  ["修复架构治理.", "Fix architecture governance."],
  ["修复架构治理。", "Fix architecture governance."],
  ["内部 Trace 与日志脱敏", "Internal Trace and Log Redaction"],
  ["补齐 trace.", "Complete trace coverage."],
  ["补齐 trace。", "Complete trace coverage."],
  ["备份恢复和 Checkpoint", "Backup Recovery and Checkpoint"],
  ["补齐恢复演练.", "Complete the recovery rehearsal."],
  ["补齐恢复演练。", "Complete the recovery rehearsal."],
  ["队列状态", "Queue Status"],
  ["监控项", "Monitor Items"],
  ["打开", "Open"],
  ["队列", "Queue"],
  ["来源", "Source"],
  ["心跳 / 更新时间", "Heartbeat / Updated"],
  ["说明", "Description"],
  ["无 owner", "No Owner"],
  ["无更新时间", "No Update Time"],
  ["暂无队列记录", "No Queue Records"],
  ["当前没有导入解析, 知识蒸馏, 智能巡检或队列监控记录.", "There are currently no import parsing, knowledge distillation, inspection-agent, or queue monitor records."],
  ["当前没有导入解析、知识蒸馏、智能巡检或队列监控记录。", "There are currently no import parsing, knowledge distillation, inspection-agent, or queue monitor records."],
  ["任务记录", "Job Records"],
  ["完成", "Completed"],
  ["失败", "Failed"],
  ["任务 ID", "Job ID"],
  ["队列 ID", "Queue ID"],
  ["进度", "Progress"],
  ["耗时", "Elapsed"],
  ["未登记", "Unregistered"],
  ["处理中", "Processing"],
  ["暂无任务记录", "No Job Records"],
  ["当前筛选条件下没有匹配任务.", "No jobs match the current filters."],
  ["当前筛选条件下没有匹配任务。", "No jobs match the current filters."],
  ["日志记录", "Logs"],
  ["汇总服务端上传, 知识库, 任务队列, 任务, 进程, 报警, 认证和工具调用日志.", "Aggregates server upload, knowledge base, task queue, job, process, alert, auth, and tool-invocation logs."],
  ["汇总服务端上传、知识库、任务队列、任务、进程、报警、认证和工具调用日志。", "Aggregates server upload, knowledge base, task queue, job, process, alert, auth, and tool-invocation logs."],
  ["显示", "Visible"],
  ["收起筛选", "Collapse Filters"],
  ["高级筛选", "Advanced Filters"],
  ["导出 CSV", "Export CSV"],
  ["筛选 ID / 对象", "Filter ID / Object"],
  ["阶段 / 详情关键词", "Stage / Detail Keyword"],
  ["暂无系统日志", "No System Logs"],
  ["阶段", "Stage"],
  ["详情", "Details"],
  ["错误", "Error"],
  ["客户端信息", "Client Info"],
  ["版本", "Version"],
  ["连接方式", "Connection Method"],
  ["最近活跃", "Last Active"],
  ["服务 UID", "Server UID"],
  ["搜索 标签, ID, 主机或系统...", "Search label, ID, host, or system..."],
  ["搜索 标签、ID、主机或系统…", "Search label, ID, host, or system..."],
  ["导入", "Import"],
  ["未上报", "Not Reported"],
  ["未接入", "Not Connected"],
  ["暂无匹配客户端", "No Matching Clients"],
  ["请尝试更换搜索条件或检查网络连接.", "Try changing the search criteria or checking the network connection."],
  ["请尝试更换搜索条件或检查网络连接。", "Try changing the search criteria or checking the network connection."],
  ["已切换", "Switched"],
  ["迁移中", "Migrating"],
  ["最近上报", "Last Reported"],
  ["发布中", "Publishing"],
  ["引导地址", "Bootstrap URL"],
  ["离线判定", "Offline Threshold"],
  ["暂无上报", "No Reports"],
  ["工具管理平台", "Tool Management Platform"],
  ["目录指纹", "Catalog Fingerprint"],
  ["内部", "Internal"],
  ["授权", "Grants"],
  ["调用总量", "Total Calls"],
  ["拒绝", "Denied"],
  ["限流", "Rate Limited"],
  ["平均耗时", "Average Latency"],
  ["尚未加载工具目录", "Tool catalog has not been loaded"],
  ["提示", "Notice"],
  ["词云分类后台任务", "Word-cloud Classification Background Job"],
  ["中断状态", "Interruption State"],
  ["恢复状态", "Recovery State"],
  ["确认后可关闭此信息.", "Acknowledge to close this message."],
  ["确认后可关闭此信息。", "Acknowledge to close this message."],
  ["更新", "Updated"],
  ["中断原因", "Interruption Reason"],
  ["配置版本", "Config Version"],
];

const consoleSegmentPairs: ConsolePhrasePair[] = [
  ["运行代次", "Generation"],
  ["分析模块", "Analysis Modules"],
  ["当前分析引擎", "Current Analysis Engine"],
  ["服务可用", "Server Available"],
  ["服务不可用", "Server Unavailable"],
  ["最近调用", "last call"],
  ["调用面", "surface"],
  ["作用和关联", "role and relation"],
  ["全部状态", "all statuses"],
  ["所有状态", "all statuses"],
  ["待决策", "pending decision"],
  ["未记录", "not recorded"],
  ["未命名", "unnamed"],
];

function translateDynamicConsoleName(value: string, locale: ConsoleLocale) {
  const trimmed = value.trim();
  if (locale === "en") {
    return zhToEn.get(trimmed) || trimmed;
  }
  return enToZh.get(trimmed) || trimmed;
}

const consolePatternPairs: ConsolePatternPair[] = [
  {
    zh: /^(\d+)\s*个账号$/,
    en: (match) => `${match[1]} accounts`,
    enPattern: /^(\d+)\s*accounts$/,
    zhBack: (match) => `${match[1]} 个账号`,
  },
  {
    zh: /^(\d+)\s*个会话\s*\/\s*(\d+)\s*条记录$/,
    en: (match) => `${match[1]} sessions / ${match[2]} records`,
    enPattern: /^(\d+)\s*sessions\s*\/\s*(\d+)\s*records$/,
    zhBack: (match) => `${match[1]} 个会话 / ${match[2]} 条记录`,
  },
  {
    zh: /^目录\s*(\d+)$/,
    en: (match) => `Directories ${match[1]}`,
    enPattern: /^Directories\s*(\d+)$/,
    zhBack: (match) => `目录 ${match[1]}`,
  },
  {
    zh: /^第\s*(\d+)\s*轮$/,
    en: (match) => `Round ${match[1]}`,
    enPattern: /^Round\s*(\d+)$/,
    zhBack: (match) => `第 ${match[1]} 轮`,
  },
  {
    zh: /^(\d+)\s*轮$/,
    en: (match) => `${match[1]} rounds`,
    enPattern: /^(\d+)\s*rounds$/,
    zhBack: (match) => `${match[1]} 轮`,
  },
  {
    zh: /^(\d+)\s*条，滚动查看$/,
    en: (match) => `${match[1]} items, scroll to view`,
    enPattern: /^(\d+)\s*items,\s*scroll to view$/,
    zhBack: (match) => `${match[1]} 条，滚动查看`,
  },
  {
    zh: /^运行代次\s*(\d+)，可用\s*(\d+)\/(\d+)$/,
    en: (match) => `Generation ${match[1]}, available ${match[2]}/${match[3]}`,
    enPattern: /^Generation\s*(\d+),\s*available\s*(\d+)\/(\d+)$/,
    zhBack: (match) => `运行代次 ${match[1]}，可用 ${match[2]}/${match[3]}`,
  },
  {
    zh: /^进程\s*(\d+)\s*\/\s*(\d+)$/,
    en: (match) => `Processes ${match[1]} / ${match[2]}`,
    enPattern: /^Processes\s*(\d+)\s*\/\s*(\d+)$/,
    zhBack: (match) => `进程 ${match[1]} / ${match[2]}`,
  },
  {
    zh: /^报警\s*(\d+)$/,
    en: (match) => `Alerts ${match[1]}`,
    enPattern: /^Alerts\s*(\d+)$/,
    zhBack: (match) => `报警 ${match[1]}`,
  },
  {
    zh: /^客户端\s*(\d+)$/,
    en: (match) => `Clients ${match[1]}`,
    enPattern: /^Clients\s*(\d+)$/,
    zhBack: (match) => `客户端 ${match[1]}`,
  },
  {
    zh: /^调用\s*(\d+)$/,
    en: (match) => `Calls ${match[1]}`,
    enPattern: /^Calls\s*(\d+)$/,
    zhBack: (match) => `调用 ${match[1]}`,
  },
  {
    zh: /^可见\s*(\d+)$/,
    en: (match) => `Visible ${match[1]}`,
    enPattern: /^Visible\s*(\d+)$/,
    zhBack: (match) => `可见 ${match[1]}`,
  },
  {
    zh: /^严重\s*(\d+)$/,
    en: (match) => `Critical ${match[1]}`,
    enPattern: /^Critical\s*(\d+)$/,
    zhBack: (match) => `严重 ${match[1]}`,
  },
  {
    zh: /^(\d+)\s*个原始对象$/,
    en: (match) => `${match[1]} raw objects`,
    enPattern: /^(\d+)\s*raw objects$/,
    zhBack: (match) => `${match[1]} 个原始对象`,
  },
  {
    zh: /^(\d+)\s*条线索$/,
    en: (match) => `${match[1]} clues`,
    enPattern: /^(\d+)\s*clues$/,
    zhBack: (match) => `${match[1]} 条线索`,
  },
  {
    zh: /^(\d+)\s*已完成$/,
    en: (match) => `${match[1]} completed`,
    enPattern: /^(\d+)\s*completed$/,
    zhBack: (match) => `${match[1]} 已完成`,
  },
  {
    zh: /^(\d+)\s*项严重[,，]\s*(\d+)\s*项警告$/,
    en: (match) => `${match[1]} critical, ${match[2]} warnings`,
    enPattern: /^(\d+)\s*critical,\s*(\d+)\s*warnings$/,
    zhBack: (match) => `${match[1]} 项严重，${match[2]} 项警告`,
  },
  {
    zh: /^(\d+)\s*项$/,
    en: (match) => `${match[1]} items`,
    enPattern: /^(\d+)\s*items$/,
    zhBack: (match) => `${match[1]} 项`,
  },
  {
    zh: /^(\d+)\s*条$/,
    en: (match) => `${match[1]} items`,
    enPattern: /^(\d+)\s*items$/,
    zhBack: (match) => `${match[1]} 条`,
  },
  {
    zh: /^(\d+)\s*个文档$/,
    en: (match) => `${match[1]} documents`,
    enPattern: /^(\d+)\s*documents$/,
    zhBack: (match) => `${match[1]} 个文档`,
  },
  {
    zh: /^(\d+)\s*条证据$/,
    en: (match) => `${match[1]} evidence items`,
    enPattern: /^(\d+)\s*evidence items$/,
    zhBack: (match) => `${match[1]} 条证据`,
  },
  {
    zh: /^(\d+)\s*个受管目录$/,
    en: (match) => `${match[1]} managed directories`,
    enPattern: /^(\d+)\s*managed directories$/,
    zhBack: (match) => `${match[1]} 个受管目录`,
  },
  {
    zh: /^(\d+)\s*个可继续会话$/,
    en: (match) => `${match[1]} continuable sessions`,
    enPattern: /^(\d+)\s*continuable sessions$/,
    zhBack: (match) => `${match[1]} 个可继续会话`,
  },
  {
    zh: /^(\d+)\s*个会话$/,
    en: (match) => `${match[1]} sessions`,
    enPattern: /^(\d+)\s*sessions$/,
    zhBack: (match) => `${match[1]} 个会话`,
  },
  {
    zh: /^(\d+)\s*个知识源$/,
    en: (match) => `${match[1]} knowledge sources`,
    enPattern: /^(\d+)\s*knowledge sources$/,
    zhBack: (match) => `${match[1]} 个知识源`,
  },
  {
    zh: /^(\d+)\s*个空间$/,
    en: (match) => `${match[1]} spaces`,
    enPattern: /^(\d+)\s*spaces$/,
    zhBack: (match) => `${match[1]} 个空间`,
  },
  {
    zh: /^(\d+)\s*台$/,
    en: (match) => `${match[1]} devices`,
    enPattern: /^(\d+)\s*devices$/,
    zhBack: (match) => `${match[1]} 台`,
  },
  {
    zh: /^(\d+)\s*个$/,
    en: (match) => `${match[1]} items`,
    enPattern: /^(\d+)\s*items$/,
    zhBack: (match) => `${match[1]} 个`,
  },
  {
    zh: /^active\s*模式$/,
    en: () => "Active mode",
    enPattern: /^Active mode$/,
    zhBack: () => "active 模式",
  },
  {
    zh: /^热\s*(\d+)$/,
    en: (match) => `Hot ${match[1]}`,
    enPattern: /^Hot\s*(\d+)$/,
    zhBack: (match) => `热 ${match[1]}`,
  },
  {
    zh: /^冷却\s*(\d+)$/,
    en: (match) => `Cooling ${match[1]}`,
    enPattern: /^Cooling\s*(\d+)$/,
    zhBack: (match) => `冷却 ${match[1]}`,
  },
  {
    zh: /^运行\s*(\d+)$/,
    en: (match) => `Running ${match[1]}`,
    enPattern: /^Running\s*(\d+)$/,
    zhBack: (match) => `运行 ${match[1]}`,
  },
  {
    zh: /^活跃\s*(\d+)$/,
    en: (match) => `Active ${match[1]}`,
    enPattern: /^Active\s*(\d+)$/,
    zhBack: (match) => `活跃 ${match[1]}`,
  },
  {
    zh: /^中断\s*(\d+)$/,
    en: (match) => `Interrupted ${match[1]}`,
    enPattern: /^Interrupted\s*(\d+)$/,
    zhBack: (match) => `中断 ${match[1]}`,
  },
  {
    zh: /^恢复\s*(\d+)$/,
    en: (match) => `Recovered ${match[1]}`,
    enPattern: /^Recovered\s*(\d+)$/,
    zhBack: (match) => `恢复 ${match[1]}`,
  },
  {
    zh: /^总计\s*(\d+)$/,
    en: (match) => `Total ${match[1]}`,
    enPattern: /^Total\s*(\d+)$/,
    zhBack: (match) => `总计 ${match[1]}`,
  },
  {
    zh: /^在线\s*(\d+)$/,
    en: (match) => `Online ${match[1]}`,
    enPattern: /^Online\s*(\d+)$/,
    zhBack: (match) => `在线 ${match[1]}`,
  },
  {
    zh: /^队列\s*(\d+)$/,
    en: (match) => `Queue ${match[1]}`,
    enPattern: /^Queue\s*(\d+)$/,
    zhBack: (match) => `队列 ${match[1]}`,
  },
  {
    zh: /^(.+?)\s*\/\s*主会话$/,
    en: (match) => `${match[1]} / main session`,
    enPattern: /^(.+?)\s*\/\s*main session$/,
    zhBack: (match) => `${match[1]} / 主会话`,
  },
  {
    zh: /^(.+?)\s*·\s*(\d+)\s*事件\s*·\s*主线\s*·\s*(.+)$/,
    en: (match) => `${match[1]} · ${match[2]} event · mainline · ${match[3]}`,
    enPattern: /^(.+?)\s*·\s*(\d+)\s*event\s*·\s*mainline\s*·\s*(.+)$/,
    zhBack: (match) => `${match[1]} · ${match[2]} 事件 · 主线 · ${match[3]}`,
  },
  {
    zh: /^(.+?)\s+未正常运行$/,
    en: (match) => `${translateDynamicConsoleName(match[1], "en")} is not running normally`,
    enPattern: /^(.+?)\s+is not running normally$/,
    zhBack: (match) => `${translateDynamicConsoleName(match[1], "zh-CN")} 未正常运行`,
  },
  {
    zh: /^(.+?)\s+当前状态为\s+(.+?)[，,]\s*PID\s+(.+?)[，,]\s*最近心跳\s+(.+?)[。.]$/,
    en: (match) => `${translateDynamicConsoleName(match[1], "en")} current status is ${match[2]}, PID ${match[3]}, last heartbeat ${match[4]}.`,
    enPattern: /^(.+?)\s+current status is\s+(.+?),\s*PID\s+(.+?),\s*last heartbeat\s+(.+?)\.$/,
    zhBack: (match) => `${translateDynamicConsoleName(match[1], "zh-CN")} 当前状态为 ${match[2]}, PID ${match[3]}, 最近心跳 ${match[4]}.`,
  },
  {
    zh: /^后台 Worker 管理进程未运行[，,]\s*PID\s+(.+?)[。.]它负责拉起和管理导入解析、目录同步、智能巡检和智能体 Worker；请检查 launchd 服务\s+(.+?)[。.]$/,
    en: (match) => `Background Worker Manager is not running, PID ${match[1]}. It starts and manages import parsing, directory sync, inspection-agent, and agent workers; check launchd service ${match[2]}.`,
    enPattern: /^Background Worker Manager is not running,\s*PID\s+(.+?)\. It starts and manages import parsing, directory sync, inspection-agent, and agent workers; check launchd service\s+(.+?)\.$/,
    zhBack: (match) => `后台 Worker 管理进程未运行, PID ${match[1]}.它负责拉起和管理导入解析、目录同步、智能巡检和智能体 Worker；请检查 launchd 服务 ${match[2]}.`,
  },
  {
    zh: /^活跃\s*·\s*(.+)$/,
    en: (match) => `Active · ${localizeConsoleText(match[1], "en").trim()}`,
    enPattern: /^Active\s*·\s*(.+)$/,
    zhBack: (match) => `活跃 · ${localizeConsoleText(match[1], "zh-CN").trim()}`,
  },
  {
    zh: /^已恢复\s*·\s*(.+)$/,
    en: (match) => `Recovered · ${localizeConsoleText(match[1], "en").trim()}`,
    enPattern: /^Recovered\s*·\s*(.+)$/,
    zhBack: (match) => `已恢复 · ${localizeConsoleText(match[1], "zh-CN").trim()}`,
  },
  {
    zh: /^待审批\s*(\d+)$/,
    en: (match) => `Pending approvals ${match[1]}`,
    enPattern: /^Pending approvals\s*(\d+)$/,
    zhBack: (match) => `待审批 ${match[1]}`,
  },
  {
    zh: /^运行中\s*(\d+)[，,]\s*排队\s*(\d+)$/,
    en: (match) => `Running ${match[1]}, queued ${match[2]}`,
    enPattern: /^Running\s*(\d+),\s*queued\s*(\d+)$/,
    zhBack: (match) => `运行中 ${match[1]}，排队 ${match[2]}`,
  },
  {
    zh: /^邮件\s*(\d+)[，,]\s*事务\s*(\d+)$/,
    en: (match) => `Mail ${match[1]}, transactions ${match[2]}`,
    enPattern: /^Mail\s*(\d+),\s*transactions\s*(\d+)$/,
    zhBack: (match) => `邮件 ${match[1]}，事务 ${match[2]}`,
  },
  {
    zh: /^监控项\s*(\d+)$/,
    en: (match) => `Monitor items ${match[1]}`,
    enPattern: /^Monitor items\s*(\d+)$/,
    zhBack: (match) => `监控项 ${match[1]}`,
  },
  {
    zh: /^打开\s*(\d+)$/,
    en: (match) => `Open ${match[1]}`,
    enPattern: /^Open\s*(\d+)$/,
    zhBack: (match) => `打开 ${match[1]}`,
  },
  {
    zh: /^完成\s*(\d+)$/,
    en: (match) => `Completed ${match[1]}`,
    enPattern: /^Completed\s*(\d+)$/,
    zhBack: (match) => `完成 ${match[1]}`,
  },
  {
    zh: /^未通过\s*(\d+)$/,
    en: (match) => `Failed ${match[1]}`,
    enPattern: /^Failed\s*(\d+)$/,
    zhBack: (match) => `未通过 ${match[1]}`,
  },
  {
    zh: /^失败\s*(\d+)$/,
    en: (match) => `Failed ${match[1]}`,
    enPattern: /^Failed\s*(\d+)$/,
    zhBack: (match) => `失败 ${match[1]}`,
  },
  {
    zh: /^显示\s*(\d+)$/,
    en: (match) => `Visible ${match[1]}`,
    enPattern: /^Visible\s*(\d+)$/,
    zhBack: (match) => `显示 ${match[1]}`,
  },
  {
    zh: /^已切换\s*(\d+)$/,
    en: (match) => `Switched ${match[1]}`,
    enPattern: /^Switched\s*(\d+)$/,
    zhBack: (match) => `已切换 ${match[1]}`,
  },
  {
    zh: /^迁移中\s*(\d+)$/,
    en: (match) => `Migrating ${match[1]}`,
    enPattern: /^Migrating\s*(\d+)$/,
    zhBack: (match) => `迁移中 ${match[1]}`,
  },
  {
    zh: /^工具\s*(\d+)\s*\/\s*(\d+)$/,
    en: (match) => `Tools ${match[1]}/${match[2]}`,
    enPattern: /^Tools\s*(\d+)\s*\/\s*(\d+)$/,
    zhBack: (match) => `工具 ${match[1]}/${match[2]}`,
  },
  {
    zh: /^内部\s*(\d+)$/,
    en: (match) => `Internal ${match[1]}`,
    enPattern: /^Internal\s*(\d+)$/,
    zhBack: (match) => `内部 ${match[1]}`,
  },
  {
    zh: /^授权\s*(\d+)\s*\/\s*(\d+)$/,
    en: (match) => `Grants ${match[1]}/${match[2]}`,
    enPattern: /^Grants\s*(\d+)\s*\/\s*(\d+)$/,
    zhBack: (match) => `授权 ${match[1]}/${match[2]}`,
  },
  {
    zh: /^目录指纹\s*(.+)$/,
    en: (match) => `Catalog fingerprint ${localizeConsoleText(match[1], "en").trim()}`,
    enPattern: /^Catalog fingerprint\s*(.+)$/,
    zhBack: (match) => `目录指纹 ${localizeConsoleText(match[1], "zh-CN").trim()}`,
  },
  {
    zh: /^更新\s+(.+)$/,
    en: (match) => `Updated ${match[1]}`,
    enPattern: /^Updated\s+(.+)$/,
    zhBack: (match) => `更新 ${match[1]}`,
  },
  {
    zh: /^(.+?)\s+已恢复$/,
    en: (match) => `${translateDynamicConsoleName(match[1], "en")} recovered`,
    enPattern: /^(.+?)\s+recovered$/,
    zhBack: (match) => `${translateDynamicConsoleName(match[1], "zh-CN")} 已恢复`,
  },
  {
    zh: /^(.+?)\s+的中断状态已恢复[，,]\s*恢复状态\s+(.+?)[。.]确认后可关闭此信息[。.]$/,
    en: (match) => `The interruption state of ${translateDynamicConsoleName(match[1], "en")} has recovered, recovery state ${match[2]}. Acknowledge to close this message.`,
    enPattern: /^The interruption state of\s+(.+?)\s+has recovered,\s*recovery state\s+(.+?)\. Acknowledge to close this message\.$/,
    zhBack: (match) => `${translateDynamicConsoleName(match[1], "zh-CN")} 的中断状态已恢复, 恢复状态 ${match[2]}.确认后可关闭此信息.`,
  },
  {
    zh: /^失败\s*(\d+)\s*·\s*超时\s*(\d+)\s*·\s*(.+)$/,
    en: (match) => `Failed ${match[1]} · timed out ${match[2]} · ${match[3]}`,
    enPattern: /^Failed\s*(\d+)\s*·\s*timed out\s*(\d+)\s*·\s*(.+)$/,
    zhBack: (match) => `失败 ${match[1]} · 超时 ${match[2]} · ${match[3]}`,
  },
  {
    zh: /^下次\s+(.+)$/,
    en: (match) => `Next ${match[1]}`,
    enPattern: /^Next\s+(.+)$/,
    zhBack: (match) => `下次 ${match[1]}`,
  },
  {
    zh: /^最近运行$/,
    en: () => "Latest Run",
    enPattern: /^Latest Run$/,
    zhBack: () => "最近运行",
  },
];

const zhToEn = new Map<string, string>();
const enToZh = new Map<string, string>();

for (const [zh, en] of consolePhrasePairs) {
  zhToEn.set(zh, en);
  enToZh.set(en, zh);
}

function hasHan(text: string) {
  return /[\u3400-\u9fff]/u.test(text);
}

function preserveOuterWhitespace(original: string, translated: string) {
  const prefix = original.match(/^\s*/)?.[0] || "";
  const suffix = original.match(/\s*$/)?.[0] || "";
  return `${prefix}${translated}${suffix}`;
}

function applyConsolePattern(text: string, locale: ConsoleLocale) {
  for (const pattern of consolePatternPairs) {
    const match = locale === "en" ? text.match(pattern.zh) : text.match(pattern.enPattern);
    if (match) {
      return locale === "en" ? pattern.en(match) : pattern.zhBack(match);
    }
  }
  return text;
}

function applyConsoleSegments(text: string, locale: ConsoleLocale) {
  let translated = text;
  const phraseSegments = [...consolePhrasePairs]
    .filter(([zh, en]) => zh.length >= 4 && en.length >= 2)
    .sort((a, b) => b[0].length - a[0].length);
  if (locale === "en") {
    for (const [zh, en] of phraseSegments) {
      translated = translated.split(zh).join(en);
    }
    for (const [zh, en] of consoleSegmentPairs) {
      translated = translated.split(zh).join(en);
    }
    translated = translated
      .replace(/，/g, ", ")
      .replace(/。/g, ".")
      .replace(/：/g, ": ")
      .replace(/；/g, "; ")
      .replace(/、/g, ", ")
      .replace(/（/g, " (")
      .replace(/）/g, ")")
      .replace(/“|”/g, '"')
      .replace(/\s{2,}/g, " ")
      .trim();
  } else {
    const reversePhraseSegments = [...phraseSegments].sort((a, b) => b[1].length - a[1].length);
    for (const [zh, en] of reversePhraseSegments) {
      translated = translated.split(en).join(zh);
    }
    for (const [zh, en] of consoleSegmentPairs) {
      translated = translated.split(en).join(zh);
    }
  }
  return translated;
}

export function localizeConsoleText(text: string, locale: ConsoleLocale) {
  if (!text || !text.trim()) {
    return text;
  }
  const trimmed = text.trim();
  const exact = locale === "en" ? zhToEn.get(trimmed) : enToZh.get(trimmed);
  if (exact) {
    return preserveOuterWhitespace(text, exact);
  }
  const patternTranslated = applyConsolePattern(trimmed, locale);
  if (patternTranslated !== trimmed) {
    return preserveOuterWhitespace(text, patternTranslated);
  }
  if (locale === "en" && hasHan(trimmed)) {
    return preserveOuterWhitespace(text, applyConsoleSegments(trimmed, locale));
  }
  if (locale === "zh-CN" && !hasHan(trimmed)) {
    const zh = enToZh.get(trimmed);
    if (zh) {
      return preserveOuterWhitespace(text, zh);
    }
  }
  return text;
}

function shouldSkipConsoleLocalizeElement(element: Element | null) {
  if (!element) {
    return false;
  }
  const tagName = element.tagName.toLowerCase();
  if (["script", "style", "textarea", "pre", "code"].includes(tagName)) {
    return true;
  }
  if (element.closest("[data-i18n-skip], textarea, pre, code, .json-config-file-editor, .markdown-body, .agent-answer, .evidence-readable-body")) {
    return true;
  }
  return false;
}

function localizeConsoleElementAttributes(element: Element, locale: ConsoleLocale) {
  for (const attr of ["placeholder", "title", "aria-label", "alt"]) {
    const current = element.getAttribute(attr);
    if (!current) {
      continue;
    }
    const localized = localizeConsoleText(current, locale);
    if (localized !== current) {
      element.setAttribute(attr, localized);
    }
  }
}

function localizeConsoleNode(root: Node, locale: ConsoleLocale) {
  if (root.nodeType === Node.TEXT_NODE) {
    const parent = root.parentElement;
    if (!parent || shouldSkipConsoleLocalizeElement(parent)) {
      return;
    }
    const current = root.nodeValue || "";
    const localized = localizeConsoleText(current, locale);
    if (localized !== current) {
      root.nodeValue = localized;
    }
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) {
    return;
  }

  const rootElement = root.nodeType === Node.ELEMENT_NODE ? (root as Element) : null;
  if (shouldSkipConsoleLocalizeElement(rootElement)) {
    return;
  }
  if (rootElement) {
    localizeConsoleElementAttributes(rootElement, locale);
  }

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          return shouldSkipConsoleLocalizeElement(node as Element)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        }
        const parent = node.parentElement;
        return shouldSkipConsoleLocalizeElement(parent)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      localizeConsoleElementAttributes(node as Element, locale);
    } else if (node.nodeType === Node.TEXT_NODE) {
      const current = node.nodeValue || "";
      const localized = localizeConsoleText(current, locale);
      if (localized !== current) {
        node.nodeValue = localized;
      }
    }
    node = walker.nextNode();
  }
}

export function installConsoleDomLocalizer(getLocale: () => ConsoleLocale) {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return {
      refresh() {},
      disconnect() {},
    };
  }

  let refreshing = false;
  const refresh = () => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    window.requestAnimationFrame(() => {
      try {
        localizeConsoleNode(document.body, getLocale());
      } finally {
        refreshing = false;
      }
    });
  };

  const observer = new MutationObserver((mutations) => {
    if (refreshing) {
      return;
    }
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        localizeConsoleNode(mutation.target, getLocale());
        continue;
      }
      if (mutation.type === "attributes") {
        localizeConsoleNode(mutation.target, getLocale());
        continue;
      }
      mutation.addedNodes.forEach((node) => localizeConsoleNode(node, getLocale()));
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["placeholder", "title", "aria-label", "alt"],
  });
  refresh();

  return {
    refresh,
    disconnect() {
      observer.disconnect();
    },
  };
}
