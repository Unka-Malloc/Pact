<script setup lang="ts">
import { useConsole } from '../../composables/useConsole';
import {
  BrowseSelectButton,
  FeatureToggle,
  StatusPill,
} from '../../components/common';
const {
  adminView,
  busyKey,
  canBrowseServerPaths,
  enabledMountCount,
  totalMountCount,
  moduleGroups,
  moduleAvailabilityLabel,
  moduleCapabilityText,
  moduleStatusText,
  currentModulePathPlaceholder,
  isMountPathEditing,
  toggleMountPathEdit,
  consoleState,
  currentView,
  disableMountModule,
  enableMountModule,
  hasFeature,
  isAuthenticated,
  mountDraft,
  openMountPathPicker,
} = useConsole();
</script>

<template>
          <section class="modules-layout">
            <article class="surface-card module-mount-card">
              <div class="module-card-meta module-card-meta-right">
                <h3 class="module-card-title">外置模块</h3>
                <div class="section-tags">
                  <span>运行代次 {{ consoleState?.runtime?.mountGeneration || 0 }}</span>
                  <span>启用 {{ enabledMountCount }}/{{ totalMountCount }}</span>
                </div>
              </div>

              <div class="mount-config-list">
                <section
                  v-for="group in moduleGroups"
                  :key="group.id"
                  class="mount-config-group"
                >
                  <div class="mount-group-header">
                    <div>
                      <h4>{{ group.label }}</h4>
                      <p>{{ group.description }}</p>
                    </div>
                  </div>

                  <article
                    v-for="item in group.rows"
                    :key="item.name"
                    class="mount-config-item"
                    :data-enabled="item.externalEnabled"
                  >
                    <div class="mount-config-main">
                      <div class="mount-config-heading">
                        <strong>{{ item.label }}</strong>
	                        <StatusPill
	                          :enabled="item.externalEnabled"
	                          :label="moduleAvailabilityLabel(item)"
	                        />
                      </div>
                      <p>{{ item.description }}</p>
                      <dl class="module-status-list">
                        <div>
                          <dt>运行实例</dt>
                          <dd>{{ item.runtimeMount?.id || "未加载" }}</dd>
                        </div>
                        <div>
                          <dt>能力</dt>
                          <dd>{{ moduleCapabilityText(item) }}</dd>
                        </div>
                        <div>
                          <dt>运行状态</dt>
                          <dd>{{ moduleStatusText(item) }}</dd>
                        </div>
                      </dl>
                    </div>

                    <div class="mount-config-controls">
                      <label class="module-field">
                        <span>模块路径</span>
                        <div class="path-field">
                          <input
                            v-model="mountDraft[item.name]"
                            autocomplete="off"
                            :placeholder="currentModulePathPlaceholder(item)"
                          />
                          <BrowseSelectButton
                            kind="server-file"
                            button-class="path-action-button"
                            button-text="浏览"
                            size="small"
                            :disabled="!canBrowseServerPaths"
                            plain
                            @browse="openMountPathPicker(item.name)"
                          />
                        </div>
                      </label>
                      <div class="mount-config-actions">
                        <FeatureToggle
                          :model-value="item.externalEnabled"
                          :aria-label="item.externalEnabled ? `关闭${item.label}` : `开启${item.label}`"
                          :disabled="
                            busyKey === `mount:${item.name}` ||
                            (!item.externalEnabled &&
                              !String(mountDraft[item.name] || '').trim())
                          "
                          @update:model-value="$event ? enableMountModule(item.name) : disableMountModule(item.name)"
                        />
                      </div>
                    </div>
                  </article>
                </section>
              </div>
            </article>
          </section>
</template>
