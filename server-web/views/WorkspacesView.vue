<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useConsole } from '../composables/useConsole';
import BinaryCheckbox from '../components/BinaryCheckbox.vue';
import ConfigFoldCard from '../components/ConfigFoldCard.vue';
import OptionBar from '../components/OptionBar.vue';
import StatusPill from '../components/StatusPill.vue';
import WorkspaceFileTree from '../components/WorkspaceFileTree.vue';
import HistorySessionPanel from '../components/HistorySessionPanel.vue';
import type { HistorySessionPanelItem } from '../types/app';

const {
  busyKey: globalBusyKey,
  formatCompactDate,
  isAuthenticated,
  authState,
  refreshAuthState
} = useConsole();
const localBusyKey = ref('');
const busyKey = computed(() => localBusyKey.value || globalBusyKey.value);

// ─── Types ────────────────────────────────────────────────────────────────────

interface WsWorkspace {
  workspaceId: string;
  title: string;
  objective: string;
  status: string;
  parentWorkspaceId: string | null;
  profile: {
    contextProfileId?: string;
    toolGrantId?: string;
    modelAlias?: string;
    knowledgeScope?: { includeSourceIds: string[]; excludeSourceIds: string[] };
  };
  ownedSourceIds: string[];
  accessibleWorkspaceIds: string[];
  currentGeneration: number;
  createdAt: string;
  updatedAt: string;
  summary?: {
    runCount: number;
    artifactCount: number;
    openIssueCount: number;
    sessionCount?: number;
  };
  fsPath: string;
}

interface WsChainItem { workspaceId: string; title: string }

interface WsContext {
  workspaceId: string;
  currentGeneration: number;
  inheritanceChain: WsChainItem[];
  knowledgeSourceIds: string[];
  contextProfileId: string;
  toolGrantId: string;
  modelAlias: string;
}

interface WsSessionEvent {
  eventId: string;
  sequence: number;
  type: string;
  title: string;
  summary: string;
  createdAt: string;
}

interface WsSession {
  sessionId: string;
  workspaceId: string;
  title: string;
  objective: string;
  status: string;
  parentSessionId: string;
  forkedFromEventId: string;
  branchIndex: number;
  eventCount: number;
  lastEventId: string;
  appendOnly: boolean;
  updatedAt: string;
  workspace?: { workspaceId: string; title: string; currentGeneration: number };
  lastEvent?: WsSessionEvent | null;
}

interface WsSessionDetail {
  session: WsSession;
  events: WsSessionEvent[];
}

interface WsSessionContext extends WsContext {
  agentSessionId: string;
  sessionTitle: string;
  parentSessionId: string;
  forkedFromEventId: string;
  sessionEventCount: number;
  sessionAppendOnly: boolean;
}

interface CloudDriveExposureForm {
  id: string;
  name: string;
  path: string;
  permissionMode: 'all' | 'allowlist' | 'denylist';
  subjects: string;
  showPermissions: boolean;
}

interface WsCheckpointTreeSummary {
  treeId: string;
  kind: string;
  ownerId: string;
  status: string;
  nodeCount: number;
  byStatus: Record<string, number>;
  updatedAt: string;
  completedAt?: string;
}

interface WsCheckpointNode {
  nodeId: string;
  parentId: string;
  label: string;
  status: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

interface WsCheckpointTreeDetail extends WsCheckpointTreeSummary {
  rootNodeId?: string;
  nodes?: Record<string, WsCheckpointNode>;
  metadata?: Record<string, any>;
  events?: any[];
}

// ─── State ────────────────────────────────────────────────────────────────────

const workspaces        = ref<WsWorkspace[]>([]);
const sessions          = ref<WsSession[]>([]);
const selectedId        = ref('');
const selectedSessionId = ref('');
const selectedSession   = ref<WsSessionDetail | null>(null);
const chainData         = ref<any>(null);
const contextData       = ref<any>(null);
const workspaceFilesData = ref<any>(null);
const localDirMountData = ref<any>(null);
const cloudDriveData = ref<any>(null);
const cloudDriveResult = ref<any>(null);
const codespaceData = ref<any>(null);
const codespaceResult = ref<any>(null);
const workspaceCheckpointTrees = ref<WsCheckpointTreeSummary[]>([]);
const workspaceCheckpointDetail = ref<WsCheckpointTreeDetail | null>(null);
const workspaceCheckpointPreview = ref<any>(null);
const workspaceCheckpointError = ref('');
const selectedCheckpointTreeId = ref('');
const selectedCheckpointNodeId = ref('');
const sessionContextData = ref<WsSessionContext | null>(null);
const localError        = ref('');
const panel             = ref<'list' | 'create' | 'profile' | 'parent' | 'share' | 'localDir' | 'cloudDrive' | 'codespace'>('list');

const createForm = reactive({ title: '', objective: '', parentWorkspaceId: '' });
const profileForm = reactive({ contextProfileId: '', toolGrantId: '', modelAlias: '', includeSourceIds: '', excludeSourceIds: '', ownedSourceIds: '' });
const parentForm  = reactive({ parentWorkspaceId: '' });
const shareForm   = reactive({ targetWorkspaceId: '', action: 'share' as 'share' | 'unshare' });
const localDirForm = reactive({ sourcePath: '', targetPath: 'mirror', deleteExtraneous: true, maxFiles: 2000 });
const cloudDriveForm = reactive({
  provider: 'icloud',
  rootPath: '',
  driveRef: '',
  clientId: 'owner',
  managedFolderRoot: '.pact-data',
  publicFolder: 'public',
  allowedClients: 'owner, codex',
  advancedMode: false,
  exposedDirectories: [] as CloudDriveExposureForm[],
  path: 'default',
  uploadPath: 'default/pact-console-upload.txt',
  uploadContent: 'Pact cloud drive console upload\n',
  targetPath: 'cloud-drive',
});
const codespaceForm = reactive({
  provider: 'github',
  repoId: '',
  repositoryRef: '',
  branch: 'main',
  path: 'README.md',
  baseRef: 'HEAD~1',
  headRef: 'HEAD',
  diff: 'diff --git a/README.md b/README.md\n',
  reviewTarget: '',
  codeChangeId: '',
});

const showDeleteModal = ref(false);
const deleteFolderChecked = ref(false);

// ─── Derived ─────────────────────────────────────────────────────────────────

const selected = computed(() => workspaces.value.find(w => w.workspaceId === selectedId.value) ?? null);

const workspaceCheckpointNodes = computed<WsCheckpointNode[]>(() => {
  const nodes = Object.values(workspaceCheckpointDetail.value?.nodes ?? {});
  return nodes
    .filter(node => !!node?.metadata?.workspaceFileSnapshot)
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
});

const workspaceCheckpointPreviewRestore = computed(() => workspaceCheckpointPreview.value?.workspaceFileRestore ?? null);

const workspaceOptions = computed(() =>
  workspaces.value.map(w => ({ value: w.workspaceId, label: w.title || w.workspaceId.slice(0, 12) }))
);

const cloudDriveConnectionOptions = computed(() => {
  const connections = Array.isArray(cloudDriveData.value?.connections) ? cloudDriveData.value.connections : [];
  return connections.map((drive: any) => ({
    value: String(drive.driveRef || ''),
    label: `${drive.label || drive.provider} · ${String(drive.driveRef || '').slice(0, 18)}`,
  })).filter((item: { value: string }) => item.value);
});

function splitCsv(value: string) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function cloudDriveAllowedClients() {
  const clients = splitCsv(cloudDriveForm.allowedClients);
  return clients.length ? clients : ['owner'];
}

function addCloudDriveExposure() {
  const index = cloudDriveForm.exposedDirectories.length + 1;
  cloudDriveForm.exposedDirectories.push({
    id: `exposure-${Date.now()}-${index}`,
    name: `共享目录 ${index}`,
    path: '',
    permissionMode: 'all',
    subjects: '',
    showPermissions: false,
  });
}

function removeCloudDriveExposure(index: number) {
  cloudDriveForm.exposedDirectories.splice(index, 1);
}

function cloudDriveExposurePayload() {
  if (!cloudDriveForm.advancedMode) return [];
  return cloudDriveForm.exposedDirectories
    .filter(item => item.path.trim())
    .map(item => ({
      name: item.name.trim() || item.path.trim(),
      drivePath: item.path.trim(),
      spaceKind: 'advancedExposure',
      writable: false,
      accessPolicy: {
        mode: item.permissionMode,
        subjects: item.permissionMode === 'all' ? [] : splitCsv(item.subjects),
      },
    }));
}

const sessionItems = computed<HistorySessionPanelItem[]>(() =>
  sessions.value.map(session => ({
    id: session.sessionId,
    title: session.title || session.sessionId.slice(0, 12),
    meta: [
      session.workspace?.title || session.workspaceId.slice(0, 12),
      `${session.eventCount || 0} 事件`,
      session.parentSessionId ? `分支 ${session.branchIndex || 1}` : '主线',
      formatCompactDate(session.updatedAt)
    ].filter(Boolean).join(' · '),
    preview: session.lastEvent?.summary || session.objective || '暂无会话事件',
    active: selectedSessionId.value === session.sessionId,
    disabled: !!busyKey.value,
    actionLabel: '分叉',
    actionAriaLabel: `从 ${session.title || session.sessionId} 分叉`
  }))
);

function statusTone(status: string) {
  return status === 'active' ? 'success' : status === 'archived' ? 'neutral' : 'info';
}

function checkpointNodeFileCount(node: WsCheckpointNode) {
  const files = node.metadata?.workspaceFileSnapshot?.files;
  return Array.isArray(files) ? files.length : 0;
}

function checkpointNodeBasePath(node: WsCheckpointNode) {
  return String(node.metadata?.workspaceFileSnapshot?.basePath || '根目录');
}

// ─── API ──────────────────────────────────────────────────────────────────────

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

async function csrfTokenFor(method: string) {
  if (safeMethods.has(method)) return '';
  let token = authState.value?.session.csrfToken || '';
  if (!token && isAuthenticated.value) {
    const session = await refreshAuthState();
    token = session?.session.csrfToken || '';
  }
  return token;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const csrfToken = await csrfTokenFor(method);
  if (csrfToken) headers.set('x-pact-csrf', csrfToken);

  const res = await fetch(path, {
    ...options,
    method,
    credentials: 'same-origin',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function load() {
  setBusy('ws:load');
  localError.value = '';
  try {
    const [workspaceData, sessionData] = await Promise.all([
      apiFetch('/api/agent-workspaces?includeSummary=true'),
      apiFetch('/api/agent-sessions?limit=100&includeLastEvent=true'),
    ]);
    workspaces.value = workspaceData.workspaces ?? [];
    sessions.value = sessionData.sessions ?? [];
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function loadChain(id: string) {
  chainData.value = null; contextData.value = null; workspaceFilesData.value = null; localDirMountData.value = null; cloudDriveData.value = null; cloudDriveResult.value = null; codespaceData.value = null; codespaceResult.value = null;
  workspaceCheckpointTrees.value = [];
  workspaceCheckpointDetail.value = null;
  workspaceCheckpointPreview.value = null;
  workspaceCheckpointError.value = '';
  selectedCheckpointTreeId.value = '';
  selectedCheckpointNodeId.value = '';
  try {
    const [c, ctx, files, localDirs, cloudDrives, codespace] = await Promise.all([
      apiFetch(`/api/agent-workspaces/${id}/chain`),
      apiFetch(`/api/agent-workspaces/${id}/context`),
      apiFetch(`/api/agent-workspaces/${id}/files?recursive=true`).catch(() => ({ files: [] })),
      apiFetch(`/api/agent-workspaces/${id}/local-dir/mounts`).catch(() => ({ mounts: [], count: 0 })),
      apiFetch(`/api/sharedspace/drive/status?workspaceId=${encodeURIComponent(id)}`).catch(() => ({ connections: [], count: 0, providers: [] })),
      apiFetch('/api/codespace/providers/manifest').catch(() => ({ providers: {}, providerCount: 0 })),
    ]);
    chainData.value = c;
    contextData.value = ctx;
    workspaceFilesData.value = files;
    localDirMountData.value = localDirs;
    cloudDriveData.value = cloudDrives;
    codespaceData.value = codespace;
    await loadWorkspaceCheckpoints(id);
  } catch (e: any) { localError.value = e.message; }
}

watch(selectedId, (id) => { if (id) loadChain(id); });

async function loadWorkspaceCheckpoints(id: string) {
  workspaceCheckpointError.value = '';
  workspaceCheckpointPreview.value = null;
  workspaceCheckpointDetail.value = null;
  selectedCheckpointTreeId.value = '';
  selectedCheckpointNodeId.value = '';
  try {
    const data = await apiFetch(`/api/workspace/checkpoints/trees?ownerId=${encodeURIComponent(id)}&kind=workspace_files&limit=20`);
    workspaceCheckpointTrees.value = data.items ?? [];
    const firstTreeId = workspaceCheckpointTrees.value[0]?.treeId || '';
    if (firstTreeId) {
      await loadWorkspaceCheckpointTree(firstTreeId);
    }
  } catch (e: any) {
    workspaceCheckpointTrees.value = [];
    workspaceCheckpointError.value = e.message || '读取文件回退点失败。';
  }
}

async function loadWorkspaceCheckpointTree(treeId: string) {
  if (!treeId) return;
  workspaceCheckpointError.value = '';
  workspaceCheckpointPreview.value = null;
  selectedCheckpointTreeId.value = treeId;
  selectedCheckpointNodeId.value = '';
  try {
    const tree = await apiFetch(`/api/workspace/checkpoints/nodes/${encodeURIComponent(treeId)}`);
    workspaceCheckpointDetail.value = tree;
    const nodes = Object.values((tree?.nodes ?? {}) as Record<string, WsCheckpointNode>)
      .filter(node => !!node?.metadata?.workspaceFileSnapshot)
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    selectedCheckpointNodeId.value = nodes[0]?.nodeId || '';
  } catch (e: any) {
    workspaceCheckpointDetail.value = null;
    workspaceCheckpointError.value = e.message || '读取 checkpoint tree 失败。';
  }
}

async function previewWorkspaceCheckpointRestore(nodeId = selectedCheckpointNodeId.value) {
  if (!selectedId.value || !selectedCheckpointTreeId.value || !nodeId) return;
  setBusy('ws:checkpoint-preview');
  localError.value = '';
  workspaceCheckpointError.value = '';
  try {
    selectedCheckpointNodeId.value = nodeId;
    workspaceCheckpointPreview.value = await apiFetch('/api/workspace/checkpoints/restore/preview', {
      method: 'POST',
      body: JSON.stringify({
        treeId: selectedCheckpointTreeId.value,
        nodeId,
        workspaceId: selectedId.value,
        reason: 'console workspace file rollback preview',
      }),
    });
  } catch (e: any) { workspaceCheckpointError.value = e.message; }
  finally { clearBusy(); }
}

async function restoreWorkspaceCheckpoint(nodeId = selectedCheckpointNodeId.value) {
  if (!selectedId.value || !selectedCheckpointTreeId.value || !nodeId) return;
  const ok = window.confirm('确认将该工作空间的物理文件夹回退到所选 checkpoint？当前文件差异会被 checkpoint restore 覆盖。');
  if (!ok) return;
  setBusy('ws:checkpoint-restore');
  localError.value = '';
  workspaceCheckpointError.value = '';
  try {
    selectedCheckpointNodeId.value = nodeId;
    const restored = await apiFetch('/api/workspace/checkpoints/restore', {
      method: 'POST',
      body: JSON.stringify({
        treeId: selectedCheckpointTreeId.value,
        nodeId,
        workspaceId: selectedId.value,
        reason: 'console workspace file rollback',
      }),
    });
    await loadChain(selectedId.value);
    workspaceCheckpointPreview.value = restored;
    selectedCheckpointNodeId.value = nodeId;
  } catch (e: any) { workspaceCheckpointError.value = e.message; }
  finally { clearBusy(); }
}

async function selectSession(id: string) {
  if (!id) return;
  setBusy('ws:session');
  localError.value = '';
  try {
    const [sessionData, context] = await Promise.all([
      apiFetch(`/api/agent-sessions/${encodeURIComponent(id)}?includeEvents=true&eventLimit=200`),
      apiFetch(`/api/agent-sessions/${encodeURIComponent(id)}/context`),
    ]);
    selectedSessionId.value = id;
    selectedSession.value = sessionData;
    sessionContextData.value = context;
    if (context.workspaceId && selectedId.value !== context.workspaceId) {
      selectedId.value = context.workspaceId;
    }
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function forkSession(id: string) {
  if (!id) return;
  setBusy('ws:fork');
  localError.value = '';
  try {
    const result = await apiFetch(`/api/agent-sessions/${encodeURIComponent(id)}/fork`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await load();
    if (result.session?.sessionId) {
      await selectSession(result.session.sessionId);
    }
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function createWorkspace() {
  setBusy('ws:create');
  localError.value = '';
  try {
    await apiFetch('/api/agent-workspaces', { method: 'POST', body: JSON.stringify(createForm) });
    Object.assign(createForm, { title: '', objective: '', parentWorkspaceId: '' });
    panel.value = 'list';
    await load();
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function deleteWorkspace() {
  if (!selectedId.value) return;
  setBusy('ws:delete');
  localError.value = '';
  try {
    const url = `/api/agent-workspaces/${selectedId.value}` + (deleteFolderChecked.value ? '?deleteFolder=true' : '');
    await apiFetch(url, { method: 'DELETE' });
    showDeleteModal.value = false;
    deleteFolderChecked.value = false;
    selectedId.value = '';
    panel.value = 'list';
    await load();
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function setParent() {
  if (!selectedId.value) return;
  setBusy('ws:parent');
  localError.value = '';
  try {
    await apiFetch(`/api/agent-workspaces/${selectedId.value}/parent`, {
      method: 'POST',
      body: JSON.stringify({ parentWorkspaceId: parentForm.parentWorkspaceId || null }),
    });
    panel.value = 'list';
    await load();
    await loadChain(selectedId.value);
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function hotSwapProfile() {
  if (!selectedId.value) return;
  setBusy('ws:profile');
  localError.value = '';
  try {
    const includeIds = profileForm.includeSourceIds.split(',').map(s => s.trim()).filter(Boolean);
    const excludeIds = profileForm.excludeSourceIds.split(',').map(s => s.trim()).filter(Boolean);
    const ownedIds   = profileForm.ownedSourceIds.split(',').map(s => s.trim()).filter(Boolean);
    const patch: Record<string, unknown> = { knowledgeScope: { includeSourceIds: includeIds, excludeSourceIds: excludeIds } };
    if (profileForm.contextProfileId) patch.contextProfileId = profileForm.contextProfileId;
    if (profileForm.toolGrantId) patch.toolGrantId = profileForm.toolGrantId;
    if (profileForm.modelAlias) patch.modelAlias = profileForm.modelAlias;
    await apiFetch(`/api/agent-workspaces/${selectedId.value}/profile`, {
      method: 'POST', body: JSON.stringify(patch),
    });
    if (ownedIds.length > 0 || profileForm.ownedSourceIds.trim() === '') {
      await apiFetch(`/api/agent-workspaces/${selectedId.value}/sources`, {
        method: 'POST', body: JSON.stringify({ sourceIds: ownedIds }),
      });
    }
    panel.value = 'list';
    await load();
    await loadChain(selectedId.value);
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function shareOrUnshare() {
  if (!selectedId.value || !shareForm.targetWorkspaceId) return;
  setBusy('ws:share');
  localError.value = '';
  try {
    const endpoint = shareForm.action === 'share' ? 'share' : 'unshare';
    await apiFetch(`/api/agent-workspaces/${selectedId.value}/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify({ targetWorkspaceId: shareForm.targetWorkspaceId }),
    });
    panel.value = 'list';
    await load();
    await loadChain(selectedId.value);
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function connectLocalDirectory() {
  if (!selectedId.value || !localDirForm.sourcePath.trim()) return;
  setBusy('ws:local-dir-connect');
  localError.value = '';
  try {
    await apiFetch(`/api/agent-workspaces/${selectedId.value}/local-dir/connect`, {
      method: 'POST',
      body: JSON.stringify({
        sourcePath: localDirForm.sourcePath,
        targetPath: localDirForm.targetPath || '',
        deleteExtraneous: localDirForm.deleteExtraneous,
        maxFiles: localDirForm.maxFiles,
      }),
    });
    localDirForm.sourcePath = '';
    await loadChain(selectedId.value);
    panel.value = 'list';
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function syncLocalDirectory(mount: any) {
  if (!selectedId.value || !mount?.mountRef) return;
  setBusy(`ws:local-dir-sync:${mount.mountRef}`);
  localError.value = '';
  try {
    await apiFetch(`/api/agent-workspaces/${selectedId.value}/local-dir/sync/apply`, {
      method: 'POST',
      body: JSON.stringify({
        mountRef: mount.mountRef,
        targetPath: mount.targetPath || '',
        deleteExtraneous: true,
      }),
    });
    await loadChain(selectedId.value);
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

function cloudDriveQuery(extra: Record<string, unknown> = {}) {
  const query = new URLSearchParams();
  query.set('workspaceId', selectedId.value || 'default');
  if (cloudDriveForm.driveRef) query.set('driveRef', cloudDriveForm.driveRef);
  else query.set('provider', cloudDriveForm.provider);
  if (cloudDriveForm.clientId.trim()) query.set('clientId', cloudDriveForm.clientId.trim());
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && String(value) !== '') {
      query.set(key, String(value));
    }
  }
  return query.toString();
}

async function refreshCloudDriveStatus() {
  if (!selectedId.value) return;
  setBusy('ws:drive-status');
  localError.value = '';
  try {
    cloudDriveData.value = await apiFetch(`/api/sharedspace/drive/status?workspaceId=${encodeURIComponent(selectedId.value)}`);
    cloudDriveResult.value = cloudDriveData.value;
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function connectCloudDrive() {
  if (!selectedId.value) return;
  setBusy('ws:drive-connect');
  localError.value = '';
  try {
    const provider = cloudDriveForm.provider;
    const payload: Record<string, unknown> = {
      workspaceId: selectedId.value,
      provider,
      mode: provider === 'icloud' ? 'local' : 'contract',
      managedFolder: true,
      managedFolderRoot: cloudDriveForm.managedFolderRoot.trim() || '.pact-data',
      publicFolder: cloudDriveForm.publicFolder.trim() || 'public',
      allowedClients: cloudDriveAllowedClients(),
      defaultClient: cloudDriveForm.clientId.trim() || cloudDriveAllowedClients()[0] || 'owner',
      directoryMappings: cloudDriveExposurePayload(),
    };
    if (provider === 'icloud' && cloudDriveForm.rootPath.trim()) payload.rootPath = cloudDriveForm.rootPath.trim();
    if (provider !== 'icloud') payload.secretRef = `secret://pact/drive/${provider}-oauth`;
    const connected = await apiFetch('/api/sharedspace/drive/connect', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    cloudDriveForm.driveRef = connected.drive?.driveRef || cloudDriveForm.driveRef;
    await refreshCloudDriveStatus();
    cloudDriveResult.value = connected;
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function listCloudDriveItems() {
  if (!selectedId.value) return;
  setBusy('ws:drive-list');
  localError.value = '';
  try {
    cloudDriveResult.value = await apiFetch(`/api/sharedspace/drive/items?${cloudDriveQuery({
      path: cloudDriveForm.path,
      recursive: true,
      includeHash: true,
      limit: 200,
    })}`);
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function downloadCloudDriveFile() {
  if (!selectedId.value || !cloudDriveForm.path.trim()) return;
  setBusy('ws:drive-download');
  localError.value = '';
  try {
    cloudDriveResult.value = await apiFetch(`/api/sharedspace/drive/files/download?${cloudDriveQuery({
      path: cloudDriveForm.path,
      includeText: true,
    })}`);
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function uploadCloudDriveFile() {
  if (!selectedId.value || !cloudDriveForm.uploadPath.trim()) return;
  setBusy('ws:drive-upload');
  localError.value = '';
  try {
    const uploaded = await apiFetch('/api/sharedspace/drive/files/upload', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: selectedId.value,
        provider: cloudDriveForm.driveRef ? undefined : cloudDriveForm.provider,
        driveRef: cloudDriveForm.driveRef || undefined,
        clientId: cloudDriveForm.clientId.trim() || undefined,
        path: cloudDriveForm.uploadPath,
        content: cloudDriveForm.uploadContent,
        overwrite: true,
      }),
    });
    cloudDriveForm.path = cloudDriveForm.uploadPath;
    await refreshCloudDriveStatus();
    cloudDriveResult.value = uploaded;
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function planCloudDriveSync() {
  if (!selectedId.value) return;
  setBusy('ws:drive-sync-plan');
  localError.value = '';
  try {
    cloudDriveResult.value = await apiFetch('/api/sharedspace/drive/sync/plan', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: selectedId.value,
        provider: cloudDriveForm.driveRef ? undefined : cloudDriveForm.provider,
        driveRef: cloudDriveForm.driveRef || undefined,
        clientId: cloudDriveForm.clientId.trim() || undefined,
        path: cloudDriveForm.path || '',
        targetPath: cloudDriveForm.targetPath || 'cloud-drive',
        direction: 'import_to_sharedspace',
      }),
    });
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function applyCloudDriveSync() {
  if (!selectedId.value) return;
  setBusy('ws:drive-sync-apply');
  localError.value = '';
  try {
    cloudDriveResult.value = await apiFetch('/api/sharedspace/drive/sync/apply', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: selectedId.value,
        provider: cloudDriveForm.driveRef ? undefined : cloudDriveForm.provider,
        driveRef: cloudDriveForm.driveRef || undefined,
        clientId: cloudDriveForm.clientId.trim() || undefined,
        path: cloudDriveForm.path || '',
        targetPath: cloudDriveForm.targetPath || 'cloud-drive',
        direction: 'import_to_sharedspace',
        confirm: true,
      }),
    });
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function listCloudDrivePermissions() {
  if (!selectedId.value) return;
  setBusy('ws:drive-permissions');
  localError.value = '';
  try {
    cloudDriveResult.value = await apiFetch(`/api/sharedspace/drive/permissions?${cloudDriveQuery({
      path: cloudDriveForm.path || '',
    })}`);
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

function openProfile(ws: WsWorkspace) {
  const scope = ws.profile?.knowledgeScope ?? {};
  Object.assign(profileForm, {
    contextProfileId: ws.profile?.contextProfileId ?? '',
    toolGrantId:      ws.profile?.toolGrantId ?? '',
    modelAlias:       ws.profile?.modelAlias ?? '',
    includeSourceIds: (scope.includeSourceIds ?? []).join(', '),
    excludeSourceIds: (scope.excludeSourceIds ?? []).join(', '),
    ownedSourceIds:   ws.ownedSourceIds.join(', '),
  });
  panel.value = 'profile';
}

function openParent(ws: WsWorkspace) {
  parentForm.parentWorkspaceId = ws.parentWorkspaceId ?? '';
  panel.value = 'parent';
}

function openLocalDir() {
  localDirForm.sourcePath = '';
  localDirForm.targetPath = 'mirror';
  localDirForm.deleteExtraneous = true;
  localDirForm.maxFiles = 2000;
  panel.value = 'localDir';
}

function openCloudDrive() {
  cloudDriveResult.value = null;
  if (!cloudDriveForm.driveRef && cloudDriveConnectionOptions.value.length > 0) {
    cloudDriveForm.driveRef = cloudDriveConnectionOptions.value[0].value;
  }
  panel.value = 'cloudDrive';
}

function openCodespace() {
  codespaceResult.value = null;
  if (!codespaceForm.repositoryRef && selected.value?.title) {
    codespaceForm.repositoryRef = selected.value.title;
  }
  panel.value = 'codespace';
}

async function inspectCodespaceStatus() {
  setBusy('ws:codespace-status');
  localError.value = '';
  try {
    codespaceResult.value = await apiFetch('/api/codespace/repository/status', {
      method: 'POST',
      body: JSON.stringify({
        provider: codespaceForm.provider,
        repoId: codespaceForm.repoId || undefined,
        repositoryRef: codespaceForm.repositoryRef,
        branch: codespaceForm.branch,
      }),
    });
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function prepareCodespaceChange() {
  if (!selectedId.value) return;
  setBusy('ws:codespace-prepare');
  localError.value = '';
  try {
    const prepared = await apiFetch('/api/codespace/change/prepare', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: selectedId.value,
        provider: codespaceForm.provider,
        repositoryRef: codespaceForm.repositoryRef || codespaceForm.repoId,
        branch: codespaceForm.branch,
        diff: codespaceForm.diff,
        dataClass: 'codeChange',
        policy: { decision: 'allow', source: 'console' },
        checkpoint: { workspaceId: selectedId.value },
        commitPlan: [{ message: 'Pact Codespace console change' }],
      }),
    });
    codespaceForm.codeChangeId = prepared.codeChangeId || prepared.codeChange?.codeChangeId || '';
    codespaceResult.value = prepared;
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

async function uploadCodespaceChange() {
  if (!selectedId.value) return;
  setBusy('ws:codespace-upload');
  localError.value = '';
  try {
    codespaceResult.value = await apiFetch('/api/codespace/change/upload', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: selectedId.value,
        codeChangeId: codespaceForm.codeChangeId || undefined,
        provider: codespaceForm.provider,
        repoId: codespaceForm.repoId || undefined,
        repositoryRef: codespaceForm.repositoryRef,
        branch: codespaceForm.branch,
        sourceRef: codespaceForm.headRef || 'HEAD',
        targetRef: codespaceForm.branch || 'main',
        title: 'Pact Codespace console dry-run',
        dryRun: true,
        confirm: true,
      }),
    });
  } catch (e: any) { localError.value = e.message; }
  finally { clearBusy(); }
}

// busyKey helpers (work on the existing string-compat ref)
function setBusy(k: string)  { localBusyKey.value = k; }
function clearBusy()         { localBusyKey.value = ''; }

async function copyToClipboard(event: MouseEvent, text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const target = (event.currentTarget || event.target) as HTMLElement;
    const rect = target.getBoundingClientRect();
    const bubble = document.createElement('div');
    bubble.textContent = '已复制';
    bubble.className = 'pact-copy-bubble';
    bubble.style.left = `${rect.left + rect.width / 2}px`;
    bubble.style.top = `${rect.top}px`;
    document.body.appendChild(bubble);

    // Force a reflow so the transition works
    void bubble.offsetWidth;

    requestAnimationFrame(() => {
      bubble.style.transform = 'translate(-50%, -30px) scale(1.1)';
      bubble.style.opacity = '1';
    });

    setTimeout(() => {
      bubble.style.opacity = '0';
      bubble.style.transform = 'translate(-50%, -40px) scale(0.9)';
      setTimeout(() => bubble.remove(), 200);
    }, 600);
  } catch (err) {
    console.error('Failed to copy: ', err);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
load();
</script>

<template>
  <section class="workspaces-view">
    <div v-if="localError" class="status-strip danger">
      <strong>错误</strong><span>{{ localError }}</span>
      <button class="status-strip-action" type="button" @click="localError = ''">关闭</button>
    </div>

    <!-- ─── Toolbar ──────────────────────────────────────────────────── -->
    <div class="ws-toolbar">
      <h2 class="ws-toolbar-title">智能体工作空间</h2>
      <div class="ws-toolbar-actions">
        <button class="tool-button tool-button-ghost" type="button" :disabled="!!busyKey" @click="load">刷新</button>
        <button class="tool-button" type="button" @click="panel = 'create'">新建工作空间</button>
      </div>
    </div>

    <HistorySessionPanel
      :items="sessionItems"
      title="会话线程"
      :subtitle="sessions.length ? `${sessions.length} 个可继续会话` : '暂无会话'"
      max-height="260px"
      open
      @select="selectSession"
      @action="forkSession"
    />

    <!-- ─── Two-column layout ────────────────────────────────────────── -->
    <div class="ws-layout">

      <!-- List column -->
      <div class="ws-list">
        <div v-if="workspaces.length === 0" class="empty-state">
          <strong>暂无工作空间</strong>
          <span>点击"新建工作空间"创建第一个工作空间。</span>
        </div>
        <article
          v-for="ws in workspaces"
          :key="ws.workspaceId"
          class="ws-card"
          :class="{ selected: selectedId === ws.workspaceId }"
          @click="selectedId = ws.workspaceId"
        >
          <div class="ws-card-head">
            <div class="ws-card-title">
              <strong>{{ ws.title || ws.workspaceId.slice(0, 12) }}</strong>
              <span v-if="ws.parentWorkspaceId" class="ws-inherited-badge">↳ 继承</span>
            </div>
            <StatusPill :tone="statusTone(ws.status)" :label="ws.status" />
          </div>
          <p v-if="ws.objective" class="ws-card-obj">{{ ws.objective }}</p>
          <div class="ws-card-meta">
            <span>Gen {{ ws.currentGeneration }}</span>
            <span>{{ ws.ownedSourceIds.length }} 个知识源</span>
            <span>{{ ws.summary?.sessionCount ?? 0 }} 个会话</span>
            <span v-if="ws.accessibleWorkspaceIds.length">+ {{ ws.accessibleWorkspaceIds.length }} 共享</span>
            <span>{{ formatCompactDate(ws.updatedAt) }}</span>
          </div>
          <div class="ws-card-actions">
            <button class="table-action" type="button" @click.stop="openProfile(ws)">配置 Profile</button>
            <button class="table-action" type="button" @click.stop="openParent(ws)">设置继承</button>
            <button class="table-action" type="button" @click.stop="selectedId = ws.workspaceId; openLocalDir()">本机目录</button>
            <button class="table-action" type="button" @click.stop="selectedId = ws.workspaceId; openCloudDrive()">云盘</button>
            <button class="table-action" type="button" @click.stop="selectedId = ws.workspaceId; openCodespace()">代码库</button>
            <button class="table-action" type="button" @click.stop="panel = 'share'; shareForm.action = 'share'">共享</button>
          </div>
        </article>
      </div>

      <!-- Detail column -->
      <div class="ws-detail">

        <!-- ── Create form ──────────────────────────────────────────── -->
        <template v-if="panel === 'create'">
          <div class="surface-card drawer-panel">
            <div class="panel-header">
              <h4>新建工作空间</h4>
              <p>创建后可设置继承关系和 profile 来复用其他工作空间的知识库与配置。</p>
            </div>
            <div class="form-grid">
              <label><span>标题 *</span><input v-model="createForm.title" autocomplete="off" placeholder="工作空间名称" /></label>
              <label><span>目标描述</span><input v-model="createForm.objective" autocomplete="off" /></label>
              <label>
                <span>继承自（父工作空间 ID，可选）</span>
                <input v-model="createForm.parentWorkspaceId" autocomplete="off" placeholder="留空 = 根工作空间" />
              </label>
            </div>
            <div class="module-actions">
              <button class="tool-button" type="button" :disabled="!createForm.title || !!busyKey" @click="createWorkspace">
                {{ busyKey === 'ws:create' ? '创建中…' : '创建' }}
              </button>
              <button class="tool-button tool-button-ghost" type="button" @click="panel = 'list'">取消</button>
            </div>
          </div>
        </template>

        <!-- ── Profile hot-swap form ────────────────────────────────── -->
        <template v-else-if="panel === 'profile' && selected">
          <div class="surface-card drawer-panel">
            <div class="panel-header">
              <h4>热切换 Profile — {{ selected.title }}</h4>
              <p>
                修改后立即生效（Generation 自动递增）。已在运行中的智能体保持旧配置直至本次任务结束，
                新任务将使用更新后的配置。
              </p>
            </div>
            <div class="form-grid">
              <label><span>上下文 Profile ID</span><input v-model="profileForm.contextProfileId" autocomplete="off" placeholder="balanced / context-32k / context-128k 等" /></label>
              <label><span>工具 Grant ID</span><input v-model="profileForm.toolGrantId" autocomplete="off" /></label>
              <label><span>模型别名（agentId）</span><input v-model="profileForm.modelAlias" autocomplete="off" /></label>
              <label>
                <span>自有知识源 IDs（逗号分隔，完整替换）</span>
                <input v-model="profileForm.ownedSourceIds" autocomplete="off" placeholder="source_abc, source_def" />
              </label>
              <label>
                <span>额外包含来源 IDs（在继承基础上增加）</span>
                <input v-model="profileForm.includeSourceIds" autocomplete="off" />
              </label>
              <label>
                <span>排除来源 IDs（从继承结果中剔除）</span>
                <input v-model="profileForm.excludeSourceIds" autocomplete="off" />
              </label>
            </div>
            <div class="module-actions">
              <button class="tool-button" type="button" :disabled="!!busyKey" @click="hotSwapProfile">
                {{ busyKey === 'ws:profile' ? '切换中…' : '热切换 Profile' }}
              </button>
              <button class="tool-button tool-button-ghost" type="button" @click="panel = 'list'">取消</button>
            </div>
          </div>
        </template>

        <!-- ── Set parent form ──────────────────────────────────────── -->
        <template v-else-if="panel === 'parent' && selected">
          <div class="surface-card drawer-panel">
            <div class="panel-header">
              <h4>设置继承父级 — {{ selected.title }}</h4>
              <p>
                子工作空间将从父级的继承链中继承知识源和 profile 配置。
                只需声明与父级不同的部分，其余自动继承。
              </p>
            </div>
            <div class="form-grid">
              <label>
                <span>父工作空间 ID（留空移除继承关系）</span>
                <input v-model="parentForm.parentWorkspaceId" autocomplete="off" placeholder="workspace_xxxxxx" />
              </label>
            </div>
            <p class="module-note">当前可用工作空间：</p>
            <ul class="ws-id-list">
              <li v-for="ws in workspaces.filter(w => w.workspaceId !== selectedId)" :key="ws.workspaceId">
                <code @click="parentForm.parentWorkspaceId = ws.workspaceId" style="cursor:pointer">{{ ws.workspaceId }}</code>
                <span>{{ ws.title }}</span>
              </li>
            </ul>
            <div class="module-actions">
              <button class="tool-button" type="button" :disabled="!!busyKey" @click="setParent">
                {{ busyKey === 'ws:parent' ? '保存中…' : '设置继承' }}
              </button>
              <button class="tool-button tool-button-ghost" type="button" @click="panel = 'list'">取消</button>
            </div>
          </div>
        </template>

        <!-- ── Share form ────────────────────────────────────────────── -->
        <template v-else-if="panel === 'share' && selected">
          <div class="surface-card drawer-panel">
            <div class="panel-header">
              <h4>共享知识访问权 — {{ selected.title }}</h4>
              <p>
                将当前工作空间的知识（含继承的来源）授权给目标工作空间可读取。
                目标工作空间即时可用，无需等待。
              </p>
            </div>
            <div class="form-grid">
              <OptionBar
                v-model="shareForm.action"
                label="操作"
                :options="[{ value: 'share', label: '授权共享' }, { value: 'unshare', label: '撤销共享' }]"
              />
              <label>
                <span>目标工作空间 ID</span>
                <input v-model="shareForm.targetWorkspaceId" autocomplete="off" placeholder="workspace_xxxxxx" />
              </label>
            </div>
            <p class="module-note">当前已共享给：
              <code v-for="id in selected.accessibleWorkspaceIds" :key="id" style="margin-right:8px">{{ id }}</code>
              <em v-if="selected.accessibleWorkspaceIds.length === 0">（无）</em>
            </p>
            <div class="module-actions">
              <button class="tool-button" type="button" :disabled="!shareForm.targetWorkspaceId || !!busyKey" @click="shareOrUnshare">
                {{ busyKey === 'ws:share' ? '处理中…' : (shareForm.action === 'share' ? '授权' : '撤销') }}
              </button>
              <button class="tool-button tool-button-ghost" type="button" @click="panel = 'list'">取消</button>
            </div>
          </div>
        </template>

        <template v-else-if="panel === 'localDir' && selected">
          <div class="surface-card drawer-panel">
            <div class="panel-header">
              <h4>本机目录 — {{ selected.title }}</h4>
              <p>连接后配置写入服务端数据目录，后续同步通过 mountRef 执行。</p>
            </div>
            <div class="form-grid">
              <label><span>本机目录路径 *</span><input v-model="localDirForm.sourcePath" autocomplete="off" placeholder="/Users/example/Documents/project" /></label>
              <label><span>工作空间目标路径</span><input v-model="localDirForm.targetPath" autocomplete="off" placeholder="mirror" /></label>
              <label><span>文件上限</span><input v-model.number="localDirForm.maxFiles" type="number" min="1" max="10000" /></label>
              <BinaryCheckbox v-model="localDirForm.deleteExtraneous" label="同步时清理目标中的多余文件" />
            </div>
            <div class="module-actions">
              <button class="tool-button" type="button" :disabled="!localDirForm.sourcePath.trim() || !!busyKey" @click="connectLocalDirectory">
                {{ busyKey === 'ws:local-dir-connect' ? '连接中…' : '连接目录' }}
              </button>
              <button class="tool-button tool-button-ghost" type="button" @click="panel = 'list'">取消</button>
            </div>
            <div v-if="localDirMountData?.mounts?.length" class="module-panel" style="margin-top: var(--space-4);">
              <div class="module-panel-heading">
                <strong>已连接 mount</strong>
                <span>{{ localDirMountData.mounts.length }} 个</span>
              </div>
              <div class="ws-id-list">
                <div v-for="mount in localDirMountData.mounts" :key="mount.mountRef" class="ws-chain-item" style="justify-content: space-between;">
                  <code>{{ mount.mountRef.slice(0, 22) }}</code>
                  <span>{{ mount.sourceRootName }} -> {{ mount.targetPath || '根目录' }}</span>
                  <button class="table-action" type="button" :disabled="!!busyKey" @click="syncLocalDirectory(mount)">
                    {{ busyKey === `ws:local-dir-sync:${mount.mountRef}` ? '同步中…' : '同步' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>

        <template v-else-if="panel === 'cloudDrive' && selected">
          <div class="surface-card drawer-panel">
            <div class="panel-header">
              <h4>云盘 — {{ selected.title }}</h4>
              <p>云盘只作为 Sharedspace 的外部 adapter/projection；OAuth provider 当前显示 contractVerified。</p>
            </div>
            <div class="form-grid">
              <OptionBar
                v-model="cloudDriveForm.provider"
                label="Provider"
                :options="[
                  { value: 'icloud', label: 'iCloud' },
                  { value: 'onedrive', label: 'OneDrive' },
                  { value: 'google-drive', label: 'Google Drive' },
                  { value: 'dropbox', label: 'Dropbox' },
                ]"
              />
              <label>
                <span>连接</span>
                <select v-model="cloudDriveForm.driveRef">
                  <option value="">按 provider 选择</option>
                  <option v-for="drive in cloudDriveConnectionOptions" :key="drive.value" :value="drive.value">{{ drive.label }}</option>
                </select>
              </label>
              <label v-if="cloudDriveForm.provider === 'icloud'">
                <span>iCloud 受控目录</span>
                <input v-model="cloudDriveForm.rootPath" autocomplete="off" placeholder="留空使用系统 iCloud Drive 默认路径" />
              </label>
              <label><span>Pact 根目录</span><input v-model="cloudDriveForm.managedFolderRoot" autocomplete="off" /></label>
              <label><span>公共目录</span><input v-model="cloudDriveForm.publicFolder" autocomplete="off" /></label>
              <label><span>当前客户端</span><input v-model="cloudDriveForm.clientId" autocomplete="off" /></label>
              <label><span>允许客户端</span><input v-model="cloudDriveForm.allowedClients" autocomplete="off" /></label>
              <label><span>文件/文件夹路径</span><input v-model="cloudDriveForm.path" autocomplete="off" placeholder="default 或 public/example.txt" /></label>
              <label><span>上传路径</span><input v-model="cloudDriveForm.uploadPath" autocomplete="off" /></label>
              <label><span>同步目标路径</span><input v-model="cloudDriveForm.targetPath" autocomplete="off" /></label>
            </div>
            <div class="module-panel" style="margin-top: var(--space-4);">
              <div class="module-panel-heading">
                <strong>目录暴露</strong>
                <button class="table-action" type="button" :disabled="!!busyKey" @click="addCloudDriveExposure">添加目录</button>
              </div>
              <BinaryCheckbox v-model="cloudDriveForm.advancedMode" label="高级模式" />
              <div v-if="cloudDriveForm.advancedMode" class="ws-id-list" style="margin-top: var(--space-3);">
                <div v-for="(item, index) in cloudDriveForm.exposedDirectories" :key="item.id" class="module-panel" style="margin-top: var(--space-3);">
                  <div class="module-panel-heading">
                    <strong>{{ item.name || `目录 ${index + 1}` }}</strong>
                    <div class="module-actions" style="margin: 0;">
                      <button class="table-action" type="button" @click="item.showPermissions = !item.showPermissions">权限配置</button>
                      <button class="table-action" type="button" @click="removeCloudDriveExposure(index)">移除</button>
                    </div>
                  </div>
                  <div class="form-grid">
                    <label><span>名称</span><input v-model="item.name" autocomplete="off" /></label>
                    <label><span>绑定路径</span><input v-model="item.path" autocomplete="off" /></label>
                  </div>
                  <div v-if="item.showPermissions" class="form-grid" style="margin-top: var(--space-3);">
                    <label>
                      <span>访问模式</span>
                      <select v-model="item.permissionMode">
                        <option value="all">所有人可读</option>
                        <option value="allowlist">白名单</option>
                        <option value="denylist">黑名单</option>
                      </select>
                    </label>
                    <label v-if="item.permissionMode !== 'all'">
                      <span>客户端列表</span>
                      <input v-model="item.subjects" autocomplete="off" />
                    </label>
                  </div>
                </div>
                <p v-if="cloudDriveForm.exposedDirectories.length === 0" class="muted-text">暂无目录。</p>
              </div>
            </div>
            <label class="module-field-block">
              <span>上传内容</span>
              <textarea v-model="cloudDriveForm.uploadContent" rows="4" spellcheck="false"></textarea>
            </label>
            <div class="module-actions">
              <button class="tool-button" type="button" :disabled="!!busyKey" @click="connectCloudDrive">
                {{ busyKey === 'ws:drive-connect' ? '连接中…' : '连接' }}
              </button>
              <button class="tool-button" type="button" :disabled="!!busyKey" @click="listCloudDriveItems">
                {{ busyKey === 'ws:drive-list' ? '读取中…' : '列出' }}
              </button>
              <button class="tool-button" type="button" :disabled="!cloudDriveForm.path.trim() || !!busyKey" @click="downloadCloudDriveFile">
                {{ busyKey === 'ws:drive-download' ? '下载中…' : '下载' }}
              </button>
              <button class="tool-button" type="button" :disabled="!cloudDriveForm.uploadPath.trim() || !!busyKey" @click="uploadCloudDriveFile">
                {{ busyKey === 'ws:drive-upload' ? '上传中…' : '上传' }}
              </button>
              <button class="tool-button" type="button" :disabled="!!busyKey" @click="planCloudDriveSync">
                {{ busyKey === 'ws:drive-sync-plan' ? '规划中…' : '同步计划' }}
              </button>
              <button class="tool-button" type="button" :disabled="!!busyKey" @click="applyCloudDriveSync">
                {{ busyKey === 'ws:drive-sync-apply' ? '应用中…' : '应用同步' }}
              </button>
              <button class="tool-button" type="button" :disabled="!!busyKey" @click="listCloudDrivePermissions">
                {{ busyKey === 'ws:drive-permissions' ? '读取中…' : '权限' }}
              </button>
              <button class="tool-button tool-button-ghost" type="button" @click="panel = 'list'">取消</button>
            </div>
            <div v-if="cloudDriveData?.connections?.length" class="module-panel" style="margin-top: var(--space-4);">
              <div class="module-panel-heading">
                <strong>已连接云盘</strong>
                <span>{{ cloudDriveData.connections.length }} 个</span>
              </div>
              <div class="ws-id-list">
	                <div v-for="drive in cloudDriveData.connections" :key="drive.driveRef" class="ws-chain-item" style="justify-content: space-between;">
	                  <code>{{ drive.driveRef.slice(0, 22) }}</code>
	                  <span>{{ drive.provider }} · {{ drive.mode }} · {{ drive.directoryMappingCount || 0 }} 个目录</span>
	                  <StatusPill :tone="drive.contractVerified ? 'info' : 'success'" :label="drive.contractVerified ? 'contractVerified' : 'localAdapterVerified'" />
	                </div>
              </div>
            </div>
            <pre v-if="cloudDriveResult" class="config-json-preview" style="margin-top: var(--space-3);">{{ JSON.stringify(cloudDriveResult, null, 2) }}</pre>
          </div>
        </template>

        <template v-else-if="panel === 'codespace' && selected">
          <div class="surface-card drawer-panel">
            <div class="panel-header">
              <h4>代码库 — {{ selected.title }}</h4>
              <p>Codespace 统一封装 RepositoryPort 和 ReviewPort；外部凭据只显示 secretRef。</p>
            </div>
            <div class="form-grid">
              <OptionBar
                v-model="codespaceForm.provider"
                label="Provider"
                :options="[{ value: 'github', label: 'GitHub' }, { value: 'gerrit', label: 'Gerrit' }]"
              />
              <label><span>本机 repoId / worktreePath</span><input v-model="codespaceForm.repoId" autocomplete="off" placeholder="/Users/example/project" /></label>
              <label><span>Repository Ref</span><input v-model="codespaceForm.repositoryRef" autocomplete="off" placeholder="owner/repo 或 gerrit/project" /></label>
              <label><span>Branch</span><input v-model="codespaceForm.branch" autocomplete="off" placeholder="main" /></label>
              <label><span>Diff Base</span><input v-model="codespaceForm.baseRef" autocomplete="off" /></label>
              <label><span>Diff Head</span><input v-model="codespaceForm.headRef" autocomplete="off" /></label>
            </div>
            <label class="module-field-block">
              <span>ChangeSet Diff</span>
              <textarea v-model="codespaceForm.diff" rows="5" spellcheck="false"></textarea>
            </label>
            <div class="module-actions">
              <button class="tool-button" type="button" :disabled="!!busyKey" @click="inspectCodespaceStatus">
                {{ busyKey === 'ws:codespace-status' ? '读取中…' : '读取状态' }}
              </button>
              <button class="tool-button" type="button" :disabled="!!busyKey" @click="prepareCodespaceChange">
                {{ busyKey === 'ws:codespace-prepare' ? '准备中…' : '准备 ChangeSet' }}
              </button>
              <button class="tool-button" type="button" :disabled="!!busyKey" @click="uploadCodespaceChange">
                {{ busyKey === 'ws:codespace-upload' ? '验证中…' : '上传预检' }}
              </button>
              <button class="tool-button tool-button-ghost" type="button" @click="panel = 'list'">取消</button>
            </div>
            <pre v-if="codespaceResult" class="config-json-preview" style="margin-top: var(--space-3);">{{ JSON.stringify(codespaceResult, null, 2) }}</pre>
          </div>
        </template>

        <!-- ── Detail view (default) ────────────────────────────────── -->
        <template v-else-if="selected">
          <div class="surface-card">
            <div class="section-header">
              <div>
                <h3>{{ selected.title }}</h3>
                <p v-if="selected.objective" class="module-note">{{ selected.objective }}</p>
              </div>
              <div style="display: flex; gap: var(--space-2); align-items: center;">
                <StatusPill :tone="statusTone(selected.status)" :label="selected.status" />
              </div>
            </div>

            <dl class="meta-list">
              <div>
                <dt>工作空间 ID</dt>
                <dd>
                  <div class="copyable-wrapper" :data-pact-tooltip="selected.workspaceId" @click="copyToClipboard($event, selected.workspaceId)">
                    <code class="copyable-code">{{ selected.workspaceId }}</code>
                  </div>
                </dd>
              </div>
              <div><dt>当前代次</dt><dd>Generation {{ selected.currentGeneration }}</dd></div>
              <div><dt>父工作空间</dt><dd>{{ selected.parentWorkspaceId || '（根，无继承）' }}</dd></div>
              <div v-if="selected.fsPath">
                <dt>物理路径</dt>
                <dd>
                  <div class="copyable-wrapper" :data-pact-tooltip="selected.fsPath" @click="copyToClipboard($event, selected.fsPath)">
                    <code class="copyable-code">{{ selected.fsPath }}</code>
                  </div>
                </dd>
              </div>
              <div><dt>更新时间</dt><dd>{{ formatCompactDate(selected.updatedAt) }}</dd></div>
            </dl>

            <!-- Inheritance chain -->
            <section v-if="chainData" class="module-panel" style="margin: var(--space-4) 0;">
              <div class="module-panel-heading">
                <strong>继承链</strong>
                <span>{{ chainData.chain.length }} 级</span>
              </div>
              <div class="ws-chain">
                <span
                  v-for="(item, i) in chainData.chain"
                  :key="item.workspaceId"
                  class="ws-chain-item"
                  :class="{ 'is-current': item.workspaceId === selectedId }"
                >
                  <span v-if="i > 0" class="ws-chain-arrow">›</span>
                  <span>{{ item.title || item.workspaceId.slice(0, 12) }}</span>
                </span>
              </div>
            </section>

            <!-- 解析后的运行上下文（给智能体用的） -->
            <ConfigFoldCard v-if="sessionContextData && selectedSession" title="当前会话线程（切换工作状态）">
              <dl class="meta-list">
                <div><dt>会话 ID</dt><dd><code>{{ sessionContextData.agentSessionId }}</code></dd></div>
                <div><dt>事件数量</dt><dd>{{ sessionContextData.sessionEventCount }} 个</dd></div>
                <div><dt>父会话</dt><dd>{{ sessionContextData.parentSessionId || '（主线会话）' }}</dd></div>
                <div><dt>分叉事件</dt><dd>{{ sessionContextData.forkedFromEventId || '（无）' }}</dd></div>
              </dl>
              <div v-if="selectedSession.events.length" class="ws-session-events">
                <div
                  v-for="event in selectedSession.events.slice(-6)"
                  :key="event.eventId"
                  class="ws-session-event"
                >
                  <span>#{{ event.sequence }}</span>
                  <strong>{{ event.title || event.type }}</strong>
                  <small>{{ formatCompactDate(event.createdAt) }}</small>
                </div>
              </div>
            </ConfigFoldCard>

            <ConfigFoldCard v-if="contextData" title="解析后的运行上下文（智能体可直接使用）">
              <dl class="meta-list">
                <div><dt>知识源数量</dt><dd>{{ contextData.knowledgeSourceIds.length }} 个</dd></div>
                <div v-if="contextData.knowledgeSourceIds.length">
                  <dt>知识源 IDs</dt>
                  <dd>
                    <code v-for="sid in contextData.knowledgeSourceIds" :key="sid" style="margin-right:6px">{{ sid.slice(0, 14) }}…</code>
                  </dd>
                </div>
                <div><dt>上下文 Profile</dt><dd>{{ contextData.contextProfileId || '（未设置，使用默认）' }}</dd></div>
                <div><dt>工具 Grant</dt><dd>{{ contextData.toolGrantId || '（未设置，使用默认）' }}</dd></div>
                <div><dt>模型别名</dt><dd>{{ contextData.modelAlias || '（未设置，使用默认）' }}</dd></div>
              </dl>
            </ConfigFoldCard>

            <!-- Profile 配置（本级自有） -->
            <ConfigFoldCard title="本级 Profile（仅本工作空间自有的差异配置）">
              <pre class="config-json-preview">{{ JSON.stringify(selected.profile, null, 2) || '{}' }}</pre>
            </ConfigFoldCard>

            <ConfigFoldCard v-if="workspaceFilesData?.files" title="工作空间文件树（物理文件）">
              <WorkspaceFileTree :files="workspaceFilesData.files" />
            </ConfigFoldCard>

            <ConfigFoldCard title="本机目录 mount（v0.0.1）">
              <div class="checkpoint-toolbar">
                <div>
                  <strong>{{ localDirMountData?.count ?? 0 }} 个受控目录</strong>
                  <span v-if="localDirMountData?.configPath">配置：{{ localDirMountData.configPath }}</span>
                </div>
                <button class="table-action" type="button" :disabled="!!busyKey" @click="openLocalDir">连接目录</button>
              </div>
              <div v-if="localDirMountData?.mounts?.length" class="ws-id-list" style="margin-top: var(--space-3);">
                <div v-for="mount in localDirMountData.mounts" :key="mount.mountRef" class="ws-chain-item" style="justify-content: space-between;">
                  <code>{{ mount.mountRef.slice(0, 22) }}</code>
                  <span>{{ mount.sourceRootName }} -> {{ mount.targetPath || '根目录' }}</span>
                  <StatusPill :tone="mount.status === 'active' ? 'success' : 'neutral'" :label="mount.status" />
                  <button class="table-action" type="button" :disabled="!!busyKey" @click="syncLocalDirectory(mount)">
                    {{ busyKey === `ws:local-dir-sync:${mount.mountRef}` ? '同步中…' : '同步' }}
                  </button>
                </div>
              </div>
              <div v-else class="checkpoint-empty">当前工作空间还没有连接本机目录。</div>
            </ConfigFoldCard>

            <ConfigFoldCard title="云盘 Cloud Drive（v0.0.1）">
              <div class="checkpoint-toolbar">
                <div>
                  <strong>{{ cloudDriveData?.connectedProviderCount ?? 0 }} / {{ cloudDriveData?.providerCount ?? 0 }} 个 provider 已连接</strong>
                  <span v-if="cloudDriveData?.configPath">配置：{{ cloudDriveData.configPath }}</span>
                </div>
                <button class="table-action" type="button" :disabled="!!busyKey" @click="openCloudDrive">打开工作台</button>
              </div>
              <div v-if="cloudDriveData?.connections?.length" class="ws-id-list" style="margin-top: var(--space-3);">
                <div v-for="drive in cloudDriveData.connections" :key="drive.driveRef" class="ws-chain-item" style="justify-content: space-between;">
                  <code>{{ drive.driveRef.slice(0, 22) }}</code>
                  <span>{{ drive.provider }} · {{ drive.mode }} · {{ drive.rootName || drive.secretRef }}</span>
                  <StatusPill :tone="drive.contractVerified ? 'info' : 'success'" :label="drive.contractVerified ? 'contractVerified' : 'localAdapterVerified'" />
                </div>
              </div>
              <div v-else class="checkpoint-empty">当前工作空间还没有连接云盘。</div>
            </ConfigFoldCard>

            <ConfigFoldCard title="代码库 Codespace（v0.0.1）">
              <div class="checkpoint-toolbar">
                <div>
                  <strong>{{ codespaceData?.enabledProviderCount ?? 0 }} / {{ codespaceData?.providerCount ?? 0 }} 个 provider 可用</strong>
                  <span v-if="codespaceData?.configPath">配置：{{ codespaceData.configPath }}</span>
                </div>
                <button class="table-action" type="button" :disabled="!!busyKey" @click="openCodespace">打开工作台</button>
              </div>
              <div v-if="codespaceData?.providers" class="ws-id-list" style="margin-top: var(--space-3);">
                <div v-for="provider in codespaceData.providers" :key="provider.provider" class="ws-chain-item" style="justify-content: space-between;">
                  <code>{{ provider.provider }}</code>
                  <span>{{ provider.mode }} · {{ provider.secretRef }}</span>
                  <StatusPill :tone="provider.enabled ? 'success' : 'neutral'" :label="provider.enabled ? 'enabled' : 'disabled'" />
                </div>
              </div>
              <div v-else class="checkpoint-empty">Codespace provider manifest 尚未加载。</div>
            </ConfigFoldCard>

            <ConfigFoldCard title="文件回退点（管控台）">
              <div class="checkpoint-panel">
                <div class="checkpoint-toolbar">
                  <div>
                    <strong>{{ workspaceCheckpointTrees.length }} 个文件 checkpoint tree</strong>
                    <span>来源：workspace_files 快照；用于管理员手动预览和回退本机共享文件夹。</span>
                  </div>
                  <button class="table-action" type="button" :disabled="!!busyKey" @click="selectedId && loadWorkspaceCheckpoints(selectedId)">
                    刷新回退点
                  </button>
                </div>

                <p v-if="workspaceCheckpointError" class="checkpoint-error">{{ workspaceCheckpointError }}</p>

                <div v-if="workspaceCheckpointTrees.length" class="checkpoint-grid">
                  <aside class="checkpoint-tree-list">
                    <button
                      v-for="tree in workspaceCheckpointTrees"
                      :key="tree.treeId"
                      type="button"
                      class="checkpoint-tree-item"
                      :class="{ selected: selectedCheckpointTreeId === tree.treeId }"
                      :disabled="!!busyKey"
                      @click="loadWorkspaceCheckpointTree(tree.treeId)"
                    >
                      <strong>{{ tree.treeId.slice(0, 18) }}</strong>
                      <span>{{ tree.status }} · {{ tree.nodeCount }} 节点 · {{ formatCompactDate(tree.updatedAt) }}</span>
                    </button>
                  </aside>

                  <div class="checkpoint-node-list">
                    <template v-if="workspaceCheckpointNodes.length">
                      <article
                        v-for="node in workspaceCheckpointNodes"
                        :key="node.nodeId"
                        class="checkpoint-node-card"
                        :class="{ selected: selectedCheckpointNodeId === node.nodeId }"
                      >
                        <div class="checkpoint-node-main">
                          <strong>{{ node.label || node.nodeId }}</strong>
                          <span>{{ node.nodeId }} · {{ checkpointNodeFileCount(node) }} 个文件 · {{ checkpointNodeBasePath(node) }}</span>
                          <small>{{ formatCompactDate(node.updatedAt || node.createdAt || '') }}</small>
                        </div>
                        <div class="checkpoint-node-actions">
                          <button class="table-action" type="button" :disabled="!!busyKey" @click="previewWorkspaceCheckpointRestore(node.nodeId)">
                            {{ busyKey === 'ws:checkpoint-preview' && selectedCheckpointNodeId === node.nodeId ? '预览中…' : '预览' }}
                          </button>
                          <button class="table-action danger-link" type="button" :disabled="!!busyKey" @click="restoreWorkspaceCheckpoint(node.nodeId)">
                            {{ busyKey === 'ws:checkpoint-restore' && selectedCheckpointNodeId === node.nodeId ? '回退中…' : '回退到此处' }}
                          </button>
                        </div>
                      </article>
                    </template>
                    <div v-else class="checkpoint-empty">当前 checkpoint tree 没有可直接回退的文件快照节点。</div>
                  </div>
                </div>
                <div v-else-if="!workspaceCheckpointError" class="checkpoint-empty">
                  当前工作空间还没有文件 checkpoint。写入、上传或删除文件后会自动出现回退点。
                </div>

                <div v-if="workspaceCheckpointPreview" class="checkpoint-preview">
                  <strong>{{ workspaceCheckpointPreview.applied ? '已执行回退' : '回退预览' }}</strong>
                  <span v-if="workspaceCheckpointPreviewRestore">
                    {{ workspaceCheckpointPreviewRestore.dryRun ? '预览' : '执行' }}
                    {{ workspaceCheckpointPreviewRestore.actions?.length ?? workspaceCheckpointPreviewRestore.appliedActions?.length ?? 0 }}
                    个文件动作
                  </span>
                  <span v-if="workspaceCheckpointPreview.restoreId">restoreId: {{ workspaceCheckpointPreview.restoreId }}</span>
                  <pre class="config-json-preview">{{ JSON.stringify(workspaceCheckpointPreview.workspaceFileRestore || workspaceCheckpointPreview, null, 2) }}</pre>
                </div>
              </div>
            </ConfigFoldCard>

            <!-- Resolved profile (inherited) -->
            <ConfigFoldCard v-if="chainData" title="解析后的合并 Profile（含继承链）">
              <pre class="config-json-preview">{{ JSON.stringify(chainData.resolvedProfile, null, 2) }}</pre>
            </ConfigFoldCard>

            <div style="margin-top: var(--space-4); border-top: 1px solid var(--border-subtle); padding-top: var(--space-4); display: flex; justify-content: flex-end;">
              <button class="tool-button" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); display: flex; align-items: center; gap: 6px; padding: 6px 12px; transition: all 0.2s;" @mouseover="$event.currentTarget.style.background='rgba(239, 68, 68, 0.2)'" @mouseleave="$event.currentTarget.style.background='rgba(239, 68, 68, 0.1)'" @click="showDeleteModal = true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"></path>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
                删除
              </button>
            </div>
          </div>
        </template>

        <div v-else class="empty-state">
          <strong>从左侧选择一个工作空间</strong>
          <span>或点击"新建工作空间"。</span>
        </div>
      </div>
    </div>

    <!-- ── Delete Confirmation Modal ─────────────────────────────── -->
    <div v-if="showDeleteModal" class="pact-modal-overlay">
      <div class="pact-modal">
        <h3>移除工作空间</h3>
        <p style="margin-top: var(--space-2); font-size: 0.9rem; color: var(--text-secondary);">
          确定要移除工作空间 <strong>{{ selected?.title }}</strong> 吗？
          此操作将解除该空间在系统中的注册。
        </p>
        <div style="margin-top: var(--space-3);">
          <BinaryCheckbox
            v-model="deleteFolderChecked"
            label="同时从文件系统中彻底删除物理文件夹及所有快照数据"
          />
        </div>

        <div style="display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-4);">
          <button class="tool-button tool-button-ghost" @click="showDeleteModal = false">取消</button>
          <button class="tool-button danger-action" @click="deleteWorkspace">确认移除</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.workspaces-view {
  display: flex; flex-direction: column; gap: var(--space-4);
  padding: var(--space-4); min-height: 0;
}
.ws-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
}
.ws-toolbar-title { margin: 0; font-size: 1rem; font-weight: 600; }
.ws-toolbar-actions { display: flex; gap: var(--space-2); }

.ws-layout {
  display: grid; grid-template-columns: 320px 1fr; gap: var(--space-4); min-height: 0; flex: 1;
}
@media (max-width: 900px) { .ws-layout { grid-template-columns: 1fr; } }
.ws-list  { display: flex; flex-direction: column; gap: var(--space-2); overflow: auto; }
.ws-detail { display: flex; flex-direction: column; gap: var(--space-3); overflow: auto; }

.ws-card {
  border: 1px solid var(--border-subtle); border-radius: var(--radius-m);
  padding: var(--space-3); background: var(--bg-surface); cursor: pointer;
  transition: border-color 0.15s;
}
.ws-card:hover { border-color: var(--border-accent); }
.ws-card.selected { border-color: var(--accent); background: var(--accent-surface); }
.ws-card-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.ws-card-title { display: flex; align-items: center; gap: var(--space-2); }
.ws-inherited-badge {
  font-size: 0.7rem; color: var(--info); border: 1px solid var(--info);
  padding: 1px 6px; border-radius: 4px;
}
.ws-card-obj { font-size: 0.8rem; color: var(--text-secondary); margin: var(--space-1) 0 0; }
.ws-card-meta { display: flex; flex-wrap: wrap; gap: var(--space-2); font-size: 0.75rem; color: var(--text-secondary); margin-top: var(--space-1); }
.ws-card-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }

.ws-chain { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 0.82rem; }
.ws-chain-item { display: flex; align-items: center; gap: 4px; }
.ws-chain-item.is-current { font-weight: 600; color: var(--accent); }
.ws-chain-arrow { color: var(--text-secondary); }

.ws-session-events {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-top: var(--space-2);
}

.ws-session-event {
  display: grid;
  grid-template-columns: 46px 1fr auto;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-s);
  padding: var(--space-1-5) var(--space-2);
  background: var(--bg-subtle);
  font-size: var(--text-sm);
}

.ws-session-event strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-session-event span,
.ws-session-event small {
  color: var(--text-secondary);
  font-size: var(--text-xs);
}

.ws-id-list { list-style: none; padding: 0; margin: var(--space-1) 0; font-size: 0.8rem; display: flex; flex-direction: column; gap: var(--space-1); }
.ws-id-list li { display: flex; align-items: center; gap: var(--space-2); }
.ws-id-list code { background: var(--bg-subtle); padding: 1px 6px; border-radius: 4px; }

.module-field-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-top: var(--space-3);
}

.module-field-block textarea {
  width: 100%;
  min-height: 120px;
  resize: vertical;
  font-family: var(--font-mono);
}

.checkpoint-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.checkpoint-toolbar {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  align-items: flex-start;
}

.checkpoint-toolbar > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.checkpoint-toolbar span,
.checkpoint-node-main span,
.checkpoint-node-main small,
.checkpoint-tree-item span {
  color: var(--text-secondary);
  font-size: var(--text-xs);
}

.checkpoint-grid {
  display: grid;
  grid-template-columns: minmax(180px, 240px) 1fr;
  gap: var(--space-3);
}

@media (max-width: 720px) { .checkpoint-grid { grid-template-columns: 1fr; } }

.checkpoint-tree-list,
.checkpoint-node-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.checkpoint-tree-item,
.checkpoint-node-card,
.checkpoint-preview,
.checkpoint-empty {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-m);
  background: var(--bg-surface);
}

.checkpoint-tree-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2);
  text-align: left;
  color: var(--text-primary);
  cursor: pointer;
}

.checkpoint-tree-item:hover,
.checkpoint-tree-item.selected,
.checkpoint-node-card.selected {
  border-color: var(--accent);
  background: var(--accent-surface);
}

.checkpoint-node-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2);
}

@media (max-width: 640px) { .checkpoint-node-card { grid-template-columns: 1fr; } }

.checkpoint-node-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.checkpoint-node-main strong,
.checkpoint-node-main span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.checkpoint-node-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}

.danger-link {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.35);
}

.checkpoint-preview,
.checkpoint-empty {
  padding: var(--space-3);
}

.checkpoint-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.checkpoint-error {
  color: #ef4444;
  margin: 0;
  font-size: var(--text-sm);
}

.config-json-preview {
  font-size: 0.78rem; line-height: 1.5; background: var(--bg-subtle);
  border: 1px solid var(--border-subtle); border-radius: var(--radius-s);
  padding: var(--space-3); overflow: auto; max-height: 240px; white-space: pre; margin: 0;
}

.pact-modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
  animation: fade-in 0.2s ease-out;
}
.pact-modal {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-l);
  padding: var(--space-4);
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
  animation: slide-up 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes slide-up {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.copyable-wrapper {
  position: relative;
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  cursor: pointer;
}
.copyable-wrapper::after {
  content: attr(data-pact-tooltip);
  position: absolute;
  top: -28px;
  left: 0;
  background: var(--pact-copy-popover-bg);
  color: var(--pact-copy-popover-fg);
  border: 1px solid var(--pact-copy-popover-border);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.1s ease-out, transform 0.1s ease-out;
  z-index: 100;
  box-shadow: var(--pact-copy-popover-shadow);
}
.copyable-wrapper:hover::after {
  opacity: 1;
  transform: translateY(0);
}

.copyable-code {
  user-select: all;
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background-color 0.15s, color 0.15s;
}
.copyable-wrapper:active .copyable-code {
  background: var(--accent);
  color: var(--bg-surface);
}
</style>

<style>
:root {
  --pact-copy-popover-bg: color-mix(in srgb, var(--bg-surface) 92%, var(--brand-subtle) 8%);
  --pact-copy-popover-fg: var(--text-primary);
  --pact-copy-popover-border: color-mix(in srgb, var(--border-subtle) 82%, var(--brand) 18%);
  --pact-copy-popover-shadow: var(--shadow-md);
}

@media (prefers-color-scheme: dark) {
  :root:not(.theme-light) {
    --pact-copy-popover-bg: color-mix(in srgb, var(--bg-subtle) 86%, var(--brand-subtle) 14%);
    --pact-copy-popover-fg: var(--text-primary);
    --pact-copy-popover-border: color-mix(in srgb, var(--border-strong) 76%, var(--brand) 24%);
    --pact-copy-popover-shadow: var(--shadow-md), inset 0 0 0 1px rgba(255,255,255,0.035);
  }
}

html.theme-dark {
  --pact-copy-popover-bg: color-mix(in srgb, var(--bg-subtle) 86%, var(--brand-subtle) 14%);
  --pact-copy-popover-fg: var(--text-primary);
  --pact-copy-popover-border: color-mix(in srgb, var(--border-strong) 76%, var(--brand) 24%);
  --pact-copy-popover-shadow: var(--shadow-md), inset 0 0 0 1px rgba(255,255,255,0.035);
}

html.theme-light {
  --pact-copy-popover-bg: color-mix(in srgb, var(--bg-surface) 92%, var(--brand-subtle) 8%);
  --pact-copy-popover-fg: var(--text-primary);
  --pact-copy-popover-border: color-mix(in srgb, var(--border-subtle) 82%, var(--brand) 18%);
  --pact-copy-popover-shadow: var(--shadow-md);
}

.pact-copy-bubble {
  position: fixed;
  background: var(--pact-copy-popover-bg);
  color: var(--pact-copy-popover-fg);
  border: 1px solid var(--pact-copy-popover-border);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
  z-index: 9999;
  opacity: 0;
  transform: translate(-50%, -10px);
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease-out;
  box-shadow: var(--pact-copy-popover-shadow);
}
</style>
