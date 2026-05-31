<script setup lang="ts">
import ConfigFoldCard from "../ConfigFoldCard.vue";
import StatusPill from "../StatusPill.vue";
import WorkspaceFileTree from "../WorkspaceFileTree.vue";
import { useWorkspacesViewContext } from "../../composables/workspacesViewContext";

const {
  busyKey,
  chainData,
  checkpointNodeBasePath,
  checkpointNodeFileCount,
  cloudDriveData,
  codespaceData,
  contextData,
  copyToClipboard,
  formatCompactDate,
  loadWorkspaceCheckpointTree,
  loadWorkspaceCheckpoints,
  localDirMountData,
  openCloudDrive,
  openCodespace,
  openLocalDir,
  previewWorkspaceCheckpointRestore,
  restoreWorkspaceCheckpoint,
  selected,
  selectedCheckpointNodeId,
  selectedCheckpointTreeId,
  selectedId,
  selectedSession,
  sessionContextData,
  showDeleteModal,
  statusTone,
  syncLocalDirectory,
  workspaceCheckpointError,
  workspaceCheckpointNodes,
  workspaceCheckpointPreview,
  workspaceCheckpointPreviewRestore,
  workspaceCheckpointTrees,
  workspaceExpansionSlotId,
  workspaceFilesData,
} = useWorkspacesViewContext();
</script>

<template>
  <Teleport v-if="selected" :to="`#${workspaceExpansionSlotId(selected)}`">
    <div class="ws-card-expanded">
      <div class="workspace-detail-body">
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
    </div>
  </Teleport>
</template>

<style scoped>
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

.ws-chain {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 0.82rem;
}

.ws-chain-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ws-chain-item.is-current {
  font-weight: 600;
  color: var(--accent);
}

.ws-chain-arrow {
  color: var(--text-secondary);
}

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

.ws-id-list {
  list-style: none;
  padding: 0;
  margin: var(--space-1) 0;
  font-size: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
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

@media (max-width: 720px) {
  .checkpoint-grid {
    grid-template-columns: 1fr;
  }
}

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

@media (max-width: 640px) {
  .checkpoint-node-card {
    grid-template-columns: 1fr;
  }
}

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
  font-size: 0.78rem;
  line-height: 1.5;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-s);
  padding: var(--space-3);
  overflow: auto;
  max-height: 240px;
  white-space: pre;
  margin: 0;
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
