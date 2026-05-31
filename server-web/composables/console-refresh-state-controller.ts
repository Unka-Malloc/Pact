import { ref } from "vue";
import type { RefreshStateOptions } from "../types/app";

export const REFRESH_STATE_DELAY_MS = 3000;

export type ConsoleRefreshStateControllerOptions = {
  performRefreshState: (options?: RefreshStateOptions) => Promise<void>;
};

export function createConsoleRefreshStateController(options: ConsoleRefreshStateControllerOptions) {
  const lastRefreshStateStartedAt = ref(0);
  const pendingRefreshStateTimer = ref<number | null>(null);
  const pendingRefreshStateOptions = ref<RefreshStateOptions | null>(null);
  const pendingRefreshStatePromise = ref<Promise<void> | null>(null);
  const pendingRefreshStateResolve = ref<(() => void) | null>(null);

  function normalizeRefreshStateOptions(value: RefreshStateOptions = {}): RefreshStateOptions {
    return {
      silent: value.silent === true,
      forceSettings: value.forceSettings === true,
      forceDrafts: value.forceDrafts === true,
    };
  }

  function mergeRefreshStateOptions(
    current: RefreshStateOptions | null,
    incoming: RefreshStateOptions = {},
  ): RefreshStateOptions {
    if (!current) {
      return normalizeRefreshStateOptions(incoming);
    }
    const left = normalizeRefreshStateOptions(current || {});
    const right = normalizeRefreshStateOptions(incoming);
    return {
      silent: left.silent && right.silent,
      forceSettings: Boolean(left.forceSettings || right.forceSettings),
      forceDrafts: Boolean(left.forceDrafts || right.forceDrafts),
    };
  }

  function clearPendingRefreshStateTimer() {
    if (pendingRefreshStateTimer.value) {
      window.clearTimeout(pendingRefreshStateTimer.value);
      pendingRefreshStateTimer.value = null;
    }
  }

  function scheduleDelayedRefreshState(value: RefreshStateOptions, delayMs: number) {
    pendingRefreshStateOptions.value = mergeRefreshStateOptions(pendingRefreshStateOptions.value, value);
    if (!pendingRefreshStatePromise.value) {
      pendingRefreshStatePromise.value = new Promise<void>((resolve) => {
        pendingRefreshStateResolve.value = resolve;
      });
    }
    if (pendingRefreshStateTimer.value) {
      return pendingRefreshStatePromise.value;
    }
    pendingRefreshStateTimer.value = window.setTimeout(() => {
      const nextOptions = pendingRefreshStateOptions.value || {};
      const resolve = pendingRefreshStateResolve.value;
      clearPendingRefreshStateTimer();
      pendingRefreshStateOptions.value = null;
      pendingRefreshStatePromise.value = null;
      pendingRefreshStateResolve.value = null;
      void performRefreshState(nextOptions).finally(() => {
        resolve?.();
      });
    }, Math.max(0, delayMs));
    return pendingRefreshStatePromise.value;
  }

  async function performRefreshState(value: RefreshStateOptions = {}) {
    lastRefreshStateStartedAt.value = Date.now();
    await options.performRefreshState(value);
  }

  async function refreshState(value: RefreshStateOptions = {}) {
    const normalized = normalizeRefreshStateOptions(value);
    if (normalized.forceSettings || normalized.forceDrafts) {
      return performRefreshState(normalized);
    }
    const elapsedMs = Date.now() - lastRefreshStateStartedAt.value;
    if (lastRefreshStateStartedAt.value > 0 && elapsedMs < REFRESH_STATE_DELAY_MS) {
      return scheduleDelayedRefreshState(
        normalized,
        REFRESH_STATE_DELAY_MS - elapsedMs,
      );
    }
    return performRefreshState(normalized);
  }

  function clearPendingRefreshState() {
    clearPendingRefreshStateTimer();
    pendingRefreshStateOptions.value = null;
    pendingRefreshStateResolve.value?.();
    pendingRefreshStatePromise.value = null;
    pendingRefreshStateResolve.value = null;
  }

  return {
    REFRESH_STATE_DELAY_MS,
    clearPendingRefreshState,
    clearPendingRefreshStateTimer,
    lastRefreshStateStartedAt,
    mergeRefreshStateOptions,
    normalizeRefreshStateOptions,
    pendingRefreshStateOptions,
    pendingRefreshStatePromise,
    pendingRefreshStateResolve,
    pendingRefreshStateTimer,
    performRefreshState,
    refreshState,
    scheduleDelayedRefreshState,
  };
}
