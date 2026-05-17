import {
  getImportExtensionRoutes,
  getImportKindRoutes
} from "./import-file-types.mjs";

export const FILE_PROCESSOR_ROUTE_TABLE_VERSION = 2;

export function getFileProcessorDefaultExtensionRouteTargets() {
  return getImportExtensionRoutes();
}

export function getFileProcessorDefaultKindRouteTargets() {
  return getImportKindRoutes();
}

export const FILE_PROCESSOR_DEFAULT_EXTENSION_ROUTE_TARGETS =
  getFileProcessorDefaultExtensionRouteTargets();

export const FILE_PROCESSOR_DEFAULT_KIND_ROUTE_TARGETS =
  getFileProcessorDefaultKindRouteTargets();
