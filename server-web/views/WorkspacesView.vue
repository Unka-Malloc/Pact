<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useConsole } from '../composables/useConsole';
import BinaryCheckbox from '../components/BinaryCheckbox.vue';
import ConfigFoldCard from '../components/ConfigFoldCard.vue';
import OptionBar from '../components/OptionBar.vue';
import StatusPill from '../components/StatusPill.vue';
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

// ─── State ────────────────────────────────────────────────────────────────────

const workspaces        = ref<WsWorkspace[]>([]);
const sessions          = ref<WsSession[]>([]);
const selectedId        = ref('');
const selectedSessionId = ref('');
const selectedSession   = ref<WsSessionDetail | null>(null);
const chainData         = ref<{ chain: WsChainItem[]; resolvedSourceIds: string[]; resolvedProfile: object } | null>(null);
const contextData       = ref<WsContext | null>(null);
const sessionContextData = ref<WsSessionContext | null>(null);
const localError        = ref('');
const panel             = ref<'list' | 'create' | 'profile' | 'parent' | 'share'>('list');

const createForm = reactive({ title: '', objective: '', parentWorkspaceId: '' });
const profileForm = reactive({ contextProfileId: '', toolGrantId: '', modelAlias: '', includeSourceIds: '', excludeSourceIds: '', ownedSourceIds: '' });
const parentForm  = reactive({ parentWorkspaceId: '' });
const shareForm   = reactive({ targetWorkspaceId: '', action: 'share' as 'share' | 'unshare' });

const showDeleteModal = ref(false);
const deleteFolderChecked = ref(false);

// ─── Derived ─────────────────────────────────────────────────────────────────

const selected = computed(() => workspaces.value.find(w => w.workspaceId === selectedId.value) ?? null);

const workspaceOptions = computed(() =>
  workspaces.value.map(w => ({ value: w.workspaceId, label: w.title || w.workspaceId.slice(0, 12) }))
);

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
  chainData.value = null; contextData.value = null;
  try {
    const [c, ctx] = await Promise.all([
      apiFetch(`/api/agent-workspaces/${id}/chain`),
      apiFetch(`/api/agent-workspaces/${id}/context`),
    ]);
    chainData.value = c;
    contextData.value = ctx;
  } catch (e: any) { localError.value = e.message; }
}

watch(selectedId, (id) => { if (id) loadChain(id); });

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
