<script setup lang="ts">
import BinaryCheckbox from '../components/BinaryCheckbox.vue';
import OptionBar from '../components/OptionBar.vue';
import StatusPill from '../components/StatusPill.vue';
import SplitToggleCard from '../components/SplitToggleCard.vue';
import HistorySessionPanel from '../components/HistorySessionPanel.vue';
import WorkspaceCloudDrivePanel from '../components/workspaces/WorkspaceCloudDrivePanel.vue';
import WorkspaceExpandedDetail from '../components/workspaces/WorkspaceExpandedDetail.vue';
import { provideWorkspacesView } from '../composables/workspacesViewContext';
import { useWorkspacesConsole } from '../composables/useWorkspacesConsole';

const workspacesView = useWorkspacesConsole();
provideWorkspacesView(workspacesView);
const workspaceKnowledgeContextContract = {
  workspaceEndpoint: "/api/agent-workspaces",
  contextEndpoint: "/context",
  sessionsEndpoint: "/api/agent-sessions",
  profileScopeField: "knowledgeScope",
  sourceIdsField: "knowledgeSourceIds",
  sessionLinkField: "agentSessionId",
  forkActionLabel: "分叉",
};
const workspaceKnowledgeContextSignature = JSON.stringify(workspaceKnowledgeContextContract);

const {
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
} = workspacesView;
</script>

<template>
  <section class="workspaces-view" :data-workspace-knowledge-context="workspaceKnowledgeContextSignature">
    <div v-if="localError" class="status-strip danger">
      <strong>错误</strong><span>{{ localError }}</span>
      <button class="status-strip-action" type="button" @click="localError = ''">关闭</button>
    </div>

    <!-- ─── Toolbar ──────────────────────────────────────────────────── -->
    <div class="ws-toolbar">
      <h2 class="ws-toolbar-title">智能体工作空间</h2>
      <div class="ws-toolbar-actions">
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
    <div class="ws-layout" :class="{ 'ws-layout-expanded-cards': panel === 'list' }">

      <!-- List column -->
      <div class="ws-list">
        <div v-if="workspaces.length === 0" class="empty-state">
          <strong>暂无工作空间</strong>
          <span>点击"新建工作空间"创建第一个工作空间。</span>
        </div>
        <SplitToggleCard
          v-for="ws in workspaces"
          :key="ws.workspaceId"
          as="article"
          class="ws-card"
          :class="{ selected: selectedId === ws.workspaceId, expanded: isWorkspaceExpanded(ws) }"
          :expanded="isWorkspaceExpanded(ws)"
          :expanded-label="`收起 ${ws.title || ws.workspaceId.slice(0, 12)} 工作空间详情`"
          :collapsed-label="`展开 ${ws.title || ws.workspaceId.slice(0, 12)} 工作空间详情`"
          @toggle="toggleWorkspaceCard(ws)"
        >
          <template #summary>
            <div class="ws-card-head">
              <div class="ws-card-title">
                <strong>{{ ws.title || ws.workspaceId.slice(0, 12) }}</strong>
                <span v-if="ws.parentWorkspaceId" class="ws-inherited-badge">↳ 继承</span>
              </div>
              <div class="ws-card-head-actions">
                <StatusPill :tone="statusTone(ws.status)" :label="ws.status" />
              </div>
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
              <button class="table-action" type="button" @click.stop="selectedId = ws.workspaceId; panel = 'share'; shareForm.action = 'share'">共享</button>
            </div>
          </template>
          <div
            :id="workspaceExpansionSlotId(ws)"
            class="ws-card-expanded-slot"
            @click.stop
          ></div>
        </SplitToggleCard>
      </div>

      <!-- Detail column -->
      <div
        v-if="panel !== 'list' || (selected && expandedWorkspaceId === selected.workspaceId)"
        class="ws-detail"
      >

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

        <WorkspaceCloudDrivePanel v-else-if="panel === 'cloudDrive' && selected" />

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
        <WorkspaceExpandedDetail v-else-if="panel === 'list' && selected && expandedWorkspaceId === selected.workspaceId" />

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
.ws-layout.ws-layout-expanded-cards { grid-template-columns: minmax(0, 1fr); }
@media (max-width: 900px) { .ws-layout { grid-template-columns: 1fr; } }
.ws-list  { display: flex; flex-direction: column; gap: 0; overflow: auto; }
.ws-detail { display: flex; flex-direction: column; gap: var(--space-3); overflow: auto; }
.ws-layout.ws-layout-expanded-cards .ws-list { overflow: visible; }
.ws-layout.ws-layout-expanded-cards .ws-detail { min-height: 0; overflow: visible; }

.ws-card {
  --split-toggle-card-radius: var(--radius-m);
  --split-toggle-card-bg: var(--bg-surface);
  --split-toggle-card-open-bg: var(--accent-surface);
  --split-toggle-card-open-border-color: var(--accent);
  --split-toggle-card-padding: var(--space-3);
  --split-toggle-card-main-gap: var(--space-1);
  --split-toggle-card-body-gap: var(--space-3);
  --split-toggle-card-toggle-width: 58px;
  --split-toggle-card-toggle-padding: 24px 0;
  --split-toggle-card-toggle-hover-color: var(--accent);
  --split-toggle-card-focus-color: var(--accent);
  position: relative;
  transition: border-color 0.15s, background-color 0.15s;
}
.ws-card + .ws-card { margin-top: -1px; }
.ws-card:not(:first-of-type) {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}
.ws-card:not(:last-of-type) {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
.ws-card:hover { --split-toggle-card-border-color: var(--border-accent); }
.ws-card.selected {
  --split-toggle-card-border-color: var(--accent);
  --split-toggle-card-bg: var(--accent-surface);
  z-index: 1;
}
.ws-card.expanded {
  --split-toggle-card-open-border-color: var(--accent);
  --split-toggle-card-open-bg: var(--accent-surface);
  z-index: 2;
}
.ws-card-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.ws-card-title { display: flex; align-items: center; gap: var(--space-2); }
.ws-card-head-actions { display: flex; align-items: center; gap: var(--space-2); }
.ws-inherited-badge {
  font-size: 0.7rem; color: var(--info); border: 1px solid var(--info);
  padding: 1px 6px; border-radius: 4px;
}
.ws-card-obj { font-size: 0.8rem; color: var(--text-secondary); margin: var(--space-1) 0 0; }
.ws-card-meta { display: flex; flex-wrap: wrap; gap: var(--space-2); font-size: 0.75rem; color: var(--text-secondary); margin-top: var(--space-1); }
.ws-card-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
.ws-card-expanded-slot { margin-top: 0; }
.ws-card-expanded {
  padding-top: 0;
  cursor: default;
}
.workspace-detail-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

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
