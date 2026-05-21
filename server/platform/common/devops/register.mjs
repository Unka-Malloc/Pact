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

export function registerDevopsPlatformServices(registry, { userDataPath = "" } = {}) {
  return [
    registerPlatformService(registry, {
      id: "devops.processStatus.get",
      platform: "devops",
      label: "Background process status",
      kind: "process-status",
      ownerFeatureId: "monitor-alert-core",
      value: (input = {}) => getBackgroundProcessStatus(input.userDataPath || userDataPath)
    }),
    registerPlatformService(registry, {
      id: "devops.monitorAlerts.state",
      platform: "devops",
      label: "Monitor alert state",
      kind: "alerts",
      ownerFeatureId: "monitor-alert-core",
      value: (input = {}) => getMonitorAlertState(input.userDataPath || userDataPath, input)
    }),
    registerPlatformService(registry, {
      id: "devops.monitorAlerts.runCycle",
      platform: "devops",
      label: "Monitor alert cycle",
      kind: "alerts",
      ownerFeatureId: "monitor-alert-core",
      value: (input = {}) => runMonitorAlertCycle(input.userDataPath || userDataPath, input)
    }),
    registerPlatformService(registry, {
      id: "devops.monitorAlerts.acknowledge",
      platform: "devops",
      label: "Monitor alert acknowledge",
      kind: "alerts",
      ownerFeatureId: "monitor-alert-core",
      value: (input = {}) =>
        acknowledgeMonitorAlert(input.userDataPath || userDataPath, input.alertId, input)
    }),
    registerPlatformService(registry, {
      id: "devops.unifiedRegistration.normalize",
      platform: "devops",
      label: "Unified registration normalize",
      kind: "registration",
      ownerFeatureId: "unified-registration-core",
      value: normalizeUnifiedRegistration
    }),
    registerPlatformService(registry, {
      id: "devops.unifiedRegistration.composeStatus",
      platform: "devops",
      label: "Unified system status compose",
      kind: "registration",
      ownerFeatureId: "unified-registration-core",
      value: composeUnifiedSystemStatus
    })
  ];
}
