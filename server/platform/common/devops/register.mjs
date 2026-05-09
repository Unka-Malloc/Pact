import { registerPlatformService } from "../../interactive/platform-registry.mjs";
import { getBackgroundProcessStatus } from "./process-status/background-process-status.mjs";
import {
  acknowledgeMonitorAlert,
  getMonitorAlertState,
  runMonitorAlertCycle
} from "./monitor-alert-core/monitor-alerts.mjs";
import {
  composeUnifiedSystemStatus,
  normalizeUnifiedRegistration
} from "./unified-registration-core/unified-registration.mjs";

export function registerOpsPlatformServices(registry, { userDataPath = "" } = {}) {
  return [
    registerPlatformService(registry, {
      id: "ops.processStatus.get",
      platform: "ops",
      label: "Background process status",
      kind: "process-status",
      ownerFeatureId: "monitor-alert-core",
      value: (input = {}) => getBackgroundProcessStatus(input.userDataPath || userDataPath)
    }),
    registerPlatformService(registry, {
      id: "ops.monitorAlerts.state",
      platform: "ops",
      label: "Monitor alert state",
      kind: "alerts",
      ownerFeatureId: "monitor-alert-core",
      value: (input = {}) => getMonitorAlertState(input.userDataPath || userDataPath, input)
    }),
    registerPlatformService(registry, {
      id: "ops.monitorAlerts.runCycle",
      platform: "ops",
      label: "Monitor alert cycle",
      kind: "alerts",
      ownerFeatureId: "monitor-alert-core",
      value: (input = {}) => runMonitorAlertCycle(input.userDataPath || userDataPath, input)
    }),
    registerPlatformService(registry, {
      id: "ops.monitorAlerts.acknowledge",
      platform: "ops",
      label: "Monitor alert acknowledge",
      kind: "alerts",
      ownerFeatureId: "monitor-alert-core",
      value: (input = {}) =>
        acknowledgeMonitorAlert(input.userDataPath || userDataPath, input.alertId, input)
    }),
    registerPlatformService(registry, {
      id: "ops.unifiedRegistration.normalize",
      platform: "ops",
      label: "Unified registration normalize",
      kind: "registration",
      ownerFeatureId: "unified-registration-core",
      value: normalizeUnifiedRegistration
    }),
    registerPlatformService(registry, {
      id: "ops.unifiedRegistration.composeStatus",
      platform: "ops",
      label: "Unified system status compose",
      kind: "registration",
      ownerFeatureId: "unified-registration-core",
      value: composeUnifiedSystemStatus
    })
  ];
}
