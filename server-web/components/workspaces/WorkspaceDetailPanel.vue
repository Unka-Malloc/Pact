<script setup lang="ts">
import BinaryCheckbox from "../BinaryCheckbox.vue";
import OptionBar from "../OptionBar.vue";
import WorkspaceCloudDrivePanel from "./WorkspaceCloudDrivePanel.vue";
import WorkspaceExpandedDetail from "./WorkspaceExpandedDetail.vue";
import { useWorkspacesViewContext } from "../../composables/workspacesViewContext";

const {
  busyKey,
  codespaceForm,
  codespaceResult,
  connectLocalDirectory,
  createForm,
  createWorkspace,
  expandedWorkspaceId,
  hotSwapProfile,
  inspectCodespaceStatus,
  localDirForm,
  localDirMountData,
  panel,
  parentForm,
  prepareCodespaceChange,
  profileForm,
  selected,
  selectedId,
  setParent,
  shareForm,
  shareOrUnshare,
  syncLocalDirectory,
  uploadCodespaceChange,
  workspaces,
} = useWorkspacesViewContext();
</script>

<template>
  <div
    v-if="panel !== 'list' || (selected && expandedWorkspaceId === selected.workspaceId)"
    class="ws-detail"
  >
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
          <label><span>本机目录路径 *</span><input v-model="localDirForm.sourcePath" autocomplete="off" placeholder="/path/to/workspace-folder" /></label>
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
        <div v-if="localDirMountData?.mounts?.length" class="module-panel workspace-mount-list">
          <div class="module-panel-heading">
            <strong>已连接 mount</strong>
            <span>{{ localDirMountData.mounts.length }} 个</span>
          </div>
          <div class="ws-id-list">
            <div v-for="mount in localDirMountData.mounts" :key="mount.mountRef" class="ws-chain-item workspace-mount-row">
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
          <label><span>本机 repoId / worktreePath</span><input v-model="codespaceForm.repoId" autocomplete="off" placeholder="/path/to/project" /></label>
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
        <pre v-if="codespaceResult" class="config-json-preview workspace-codespace-result">{{ JSON.stringify(codespaceResult, null, 2) }}</pre>
      </div>
    </template>

    <WorkspaceExpandedDetail v-else-if="panel === 'list' && selected && expandedWorkspaceId === selected.workspaceId" />

    <div v-else class="empty-state">
      <strong>从左侧选择一个工作空间</strong>
      <span>或点击"新建工作空间"。</span>
    </div>
  </div>
</template>

<style scoped>
.ws-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow: auto;
}

:global(.ws-layout.ws-layout-expanded-cards) .ws-detail {
  min-height: 0;
  overflow: visible;
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

.ws-id-list li,
.ws-chain-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.ws-id-list code {
  background: var(--bg-subtle);
  padding: 1px 6px;
  border-radius: 4px;
}

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

.workspace-mount-list,
.workspace-codespace-result {
  margin-top: var(--space-4);
}

.workspace-mount-row {
  justify-content: space-between;
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
}
</style>
