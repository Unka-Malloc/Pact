import { inject, provide, type InjectionKey } from "vue";
import type { ServerConsoleShellContext } from "./serverConsoleShellContext";

export type FeedViewContext = ServerConsoleShellContext;

const feedViewKey = Symbol("feed-view") as InjectionKey<FeedViewContext>;

export function provideFeedView(context: FeedViewContext) {
  provide(feedViewKey, context);
}

export function useFeedViewContext() {
  const context = inject(feedViewKey);
  if (!context) {
    throw new Error("Feed view context is not available");
  }
  return context;
}
