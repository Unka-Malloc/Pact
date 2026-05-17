<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useConsole } from '../composables/useConsole';
import { ConfigFoldCard, OptionBar, StatusPill } from '../components/common';

const { busyKey: globalBusyKey, formatCompactDate, isAuthenticated } = useConsole();
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
  };
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

// ─── State ────────────────────────────────────────────────────────────────────

const workspaces        = ref<WsWorkspace[]>([]);
const selectedId        = ref('');
const chainData         = ref<{ chain: WsChainItem[]; resolvedSourceIds: string[]; resolvedProfile: object } | null>(null);
const contextData       = ref<WsContext | null>(null);
const localError        = ref('');
const panel             = ref<'list' | 'create' | 'profile' | 'parent' | 'share'>('list');

const createForm = reactive({ title: '', objective: '', parentWorkspaceId: '' });
const profileForm = reactive({ contextProfileId: '', toolGrantId: '', modelAlias: '', includeSourceIds: '', excludeSourceIds: '', ownedSourceIds: '' });
const parentForm  = reactive({ parentWorkspaceId: '' });
const shareForm   = reactive({ targetWorkspaceId: '', action: 'share' as 'share' | 'unshare' });

// ─── Derived ─────────────────────────────────────────────────────────────────

const selected = computed(() => workspaces.value.find(w => w.workspaceId === selectedId.value) ?? null);

const workspaceOptions = computed(() =>
  workspaces.value.map(w => ({ value: w.workspaceId, label: w.title || w.workspaceId.slice(0, 12) }))
);

function statusTone(status: string) {
  return status === 'active' ? 'success' : status === 'archived' ? 'neutral' : 'info';
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function load() {
  setBusy('ws:load');
  localError.value = '';
  try {
    const data = await apiFetch('/api/agent-workspaces?includeSummary=true');
    workspaces.value = data.workspaces ?? [];
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
              <StatusPill :tone="statusTone(selected.status)" :label="selected.status" />
            </div>

            <dl class="meta-list">
              <div><dt>工作空间 ID</dt><dd><code>{{ selected.workspaceId }}</code></dd></div>
              <div><dt>当前代次</dt><dd>Generation {{ selected.currentGeneration }}</dd></div>
              <div><dt>父工作空间</dt><dd>{{ selected.parentWorkspaceId || '（根，无继承）' }}</dd></div>
              <div><dt>更新时间</dt><dd>{{ formatCompactDate(selected.updatedAt) }}</dd></div>
            </dl>

            <!-- Inheritance chain -->
            <section v-if="chainData" class="module-panel">
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
          </div>
        </template>

        <div v-else class="empty-state">
          <strong>从左侧选择一个工作空间</strong>
          <span>或点击"新建工作空间"。</span>
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
.ws-card-actions { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: var(--space-2); }

.ws-chain { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 0.82rem; }
.ws-chain-item { display: flex; align-items: center; gap: 4px; }
.ws-chain-item.is-current { font-weight: 600; color: var(--accent); }
.ws-chain-arrow { color: var(--text-secondary); }

.ws-id-list { list-style: none; padding: 0; margin: var(--space-1) 0; font-size: 0.8rem; display: flex; flex-direction: column; gap: var(--space-1); }
.ws-id-list li { display: flex; align-items: center; gap: var(--space-2); }
.ws-id-list code { background: var(--bg-subtle); padding: 1px 6px; border-radius: 4px; }

.config-json-preview {
  font-size: 0.78rem; line-height: 1.5; background: var(--bg-subtle);
  border: 1px solid var(--border-subtle); border-radius: var(--radius-s);
  padding: var(--space-3); overflow: auto; max-height: 240px; white-space: pre; margin: 0;
}
</style>
