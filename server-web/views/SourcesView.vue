<script setup lang="ts">
import { useConsole } from '../composables/useConsole';
import StatusPill from '../components/StatusPill.vue';
const {
  enabledMountCount,
  totalMountCount,
  consoleState,
  currentView,
  isAuthenticated,
  openAdmin,
  openDrawer,
  switchView,
} = useConsole();
</script>

<template>
          <section class="sources-layout">
            <article class="surface-card source-card">
              <div class="source-card-header">
                <div>
                  <h3>本地文件夹</h3>
                  <p>文件夹、PDF、Office、图片等批量输入，进入同一套解析与知识构建流程。</p>
                </div>
                <StatusPill
                  :enabled="enabledMountCount > 0"
                  :label="enabledMountCount > 0 ? '可用' : '未就绪'"
                />
              </div>
              <dl class="meta-list">
                <div>
                  <dt>存储状态</dt>
                  <dd>{{ (consoleState?.storage?.rawObjectCount || 0) > 0 ? "已有对象" : "等待入库" }}</dd>
                </div>
                <div>
                  <dt>原始对象</dt>
                  <dd>{{ consoleState?.storage?.rawObjectCount || 0 }}</dd>
                </div>
              </dl>
              <div class="source-actions">
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  @click="switchView('intelligence')"
                >
                  解析策略
                </button>
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  @click="openDrawer('modules')"
                >
                  高级接入
                </button>
              </div>
            </article>

            <article class="surface-card source-card">
              <div class="source-card-header">
                <div>
                  <h3>外部客户端</h3>
                  <p>桌面客户端通过服务发现接入，服务端只提供任务、解析与工具能力。</p>
                </div>
                  <StatusPill
                    :enabled="(consoleState?.clients?.summary?.totalCount || 0) > 0"
                    :label="`${consoleState?.clients?.summary?.totalCount || 0} 台`"
                  />
              </div>
              <dl class="meta-list">
                <div>
                  <dt>活跃服务</dt>
                  <dd>{{ consoleState?.discovery?.value?.activeServiceUrl || "未配置" }}</dd>
                </div>
                <div>
                  <dt>模式</dt>
                  <dd>{{ consoleState?.discovery?.value?.mode || "active" }}</dd>
                </div>
              </dl>
              <div class="source-actions">
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  @click="openAdmin('clients')"
                >
                  设备管理
                </button>
              </div>
            </article>
          </section>
</template>
