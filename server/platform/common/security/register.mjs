import { registerPlatformService } from "../../interactive/platform-registry.mjs";

export function registerSecurityPlatformServices(registry, {
  consoleAuth = null,
  operationAuditStore = null
} = {}) {
  return [
    registerPlatformService(registry, {
      id: "security.auth.console",
      platform: "security",
      label: "Console authentication",
      kind: "auth",
      ownerFeatureId: "security-permissions",
      value: consoleAuth
    }),
    registerPlatformService(registry, {
      id: "security.audit.operations",
      platform: "security",
      label: "Operation audit store",
      kind: "audit",
      ownerFeatureId: "security-permissions",
      value: operationAuditStore
    })
  ];
}
