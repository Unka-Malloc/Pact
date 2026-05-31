import { computed, reactive, ref, watch } from 'vue';
import { useServerConsoleShellContext } from './serverConsoleShellContext';
import { usePageRefreshHandler } from './usePageRefresh';
import type { HistorySessionPanelItem } from '../types/app';
import type {
  CloudDriveExposureForm,
  WsCheckpointNode,
  WsCheckpointTreeDetail,
  WsCheckpointTreeSummary,
  WsSession,
  WsSessionContext,
  WsSessionDetail,
  WsWorkspace,
} from '../types/workspaces';
import { errorMessage } from '../lib/errors';

export function useWorkspacesConsole() {
  const {
    busyKey: globalBusyKey,
    formatCompactDate,
    isAuthenticated,
    authState,
    refreshAuthState
  } = useServerConsoleShellContext();
  const localBusyKey = ref('');
  const busyKey = computed(() => localBusyKey.value || globalBusyKey.value);

  // ─── State ────────────────────────────────────────────────────────────────────

  const workspaces        = ref<WsWorkspace[]>([]);
  const sessions          = ref<WsSession[]>([]);
  const selectedId        = ref('');
  const expandedWorkspaceId = ref('');
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

  function workspaceExpansionSlotId(ws: WsWorkspace) {
    return `workspace-expansion-${ws.workspaceId}`;
  }

  function isWorkspaceExpanded(ws: WsWorkspace) {
    return panel.value === 'list' && expandedWorkspaceId.value === ws.workspaceId;
  }

  function toggleWorkspaceCard(ws: WsWorkspace) {
    const shouldCollapse = isWorkspaceExpanded(ws);
    selectedId.value = ws.workspaceId;
    panel.value = 'list';
    expandedWorkspaceId.value = shouldCollapse ? '' : ws.workspaceId;
  }

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

  function sessionLatestTimestamp(session: WsSession) {
    return String(session.lastEvent?.createdAt || session.updatedAt || session.createdAt || '');
  }

  const orderedSessions = computed(() =>
    [...sessions.value].sort((left, right) => {
      const timeCompare = sessionLatestTimestamp(right).localeCompare(sessionLatestTimestamp(left));
      if (timeCompare !== 0) return timeCompare;
      return String(right.sessionId || '').localeCompare(String(left.sessionId || ''));
    })
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
    orderedSessions.value.map(session => ({
      id: session.sessionId,
      title: session.title || session.sessionId.slice(0, 12),
      meta: [
        session.workspace?.title || session.workspaceId.slice(0, 12),
        `${session.eventCount || 0} 事件`,
        session.parentSessionId ? `分支 ${session.branchIndex || 1}` : '主线',
        formatCompactDate(sessionLatestTimestamp(session))
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
  }

  watch(selectedId, (id) => {
    if (id) {
      if (panel.value === 'list') expandedWorkspaceId.value = id;
      loadChain(id);
    } else {
      expandedWorkspaceId.value = '';
    }
  });

  watch(panel, (next) => {
    if (next === 'list') {
      if (selectedId.value) expandedWorkspaceId.value = selectedId.value;
    } else {
      expandedWorkspaceId.value = '';
    }
  });

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
    } catch (e: unknown) {
      workspaceCheckpointTrees.value = [];
      workspaceCheckpointError.value = errorMessage(e, '读取文件回退点失败。');
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
    } catch (e: unknown) {
      workspaceCheckpointDetail.value = null;
      workspaceCheckpointError.value = errorMessage(e, '读取 checkpoint tree 失败。');
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
    } catch (e: unknown) { workspaceCheckpointError.value = errorMessage(e); }
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
    } catch (e: unknown) { workspaceCheckpointError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
    finally { clearBusy(); }
  }

  function openProfile(ws: WsWorkspace) {
    const scope = (ws.profile?.knowledgeScope ?? {}) as {
      includeSourceIds?: string[];
      excludeSourceIds?: string[];
    };
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
    } catch (e: unknown) { localError.value = errorMessage(e); }
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
  usePageRefreshHandler(
    (detail) => detail.viewId === 'workspaces',
    async () => {
      await load();
      if (selectedId.value) {
        await loadChain(selectedId.value);
      }
    },
  );

  load();

  return {
    busyKey,
    formatCompactDate,
    workspaces,
    sessions,
    selectedId,
    expandedWorkspaceId,
    selectedSessionId,
    selectedSession,
    chainData,
    contextData,
    workspaceFilesData,
    localDirMountData,
    cloudDriveData,
    cloudDriveResult,
    codespaceData,
    codespaceResult,
    workspaceCheckpointTrees,
    workspaceCheckpointDetail,
    workspaceCheckpointPreview,
    workspaceCheckpointError,
    selectedCheckpointTreeId,
    selectedCheckpointNodeId,
    sessionContextData,
    localError,
    panel,
    createForm,
    profileForm,
    parentForm,
    shareForm,
    localDirForm,
    cloudDriveForm,
    codespaceForm,
    showDeleteModal,
    deleteFolderChecked,
    selected,
    workspaceExpansionSlotId,
    isWorkspaceExpanded,
    toggleWorkspaceCard,
    workspaceCheckpointNodes,
    workspaceCheckpointPreviewRestore,
    workspaceOptions,
    cloudDriveConnectionOptions,
    sessionItems,
    statusTone,
    checkpointNodeFileCount,
    checkpointNodeBasePath,
    load,
    loadChain,
    loadWorkspaceCheckpoints,
    loadWorkspaceCheckpointTree,
    previewWorkspaceCheckpointRestore,
    restoreWorkspaceCheckpoint,
    selectSession,
    forkSession,
    createWorkspace,
    deleteWorkspace,
    setParent,
    hotSwapProfile,
    shareOrUnshare,
    connectLocalDirectory,
    syncLocalDirectory,
    cloudDriveAllowedClients,
    addCloudDriveExposure,
    removeCloudDriveExposure,
    refreshCloudDriveStatus,
    connectCloudDrive,
    listCloudDriveItems,
    downloadCloudDriveFile,
    uploadCloudDriveFile,
    planCloudDriveSync,
    applyCloudDriveSync,
    listCloudDrivePermissions,
    openProfile,
    openParent,
    openLocalDir,
    openCloudDrive,
    openCodespace,
    inspectCodespaceStatus,
    prepareCodespaceChange,
    uploadCodespaceChange,
    copyToClipboard,
  };
}
