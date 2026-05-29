import { onBeforeUnmount, onMounted } from "vue";

export const PAGE_REFRESH_EVENT = "pact:page-refresh";

export type PageRefreshContext = {
  viewId: string;
  adminView: string;
  knowledgeTab: string;
  debugTab: string;
  routePath: string;
};

export type PageRefreshTask = Promise<unknown> | unknown;

export type PageRefreshEventDetail = PageRefreshContext & {
  addTask: (task: PageRefreshTask) => void;
};

export function collectPageRefreshTasks(context: PageRefreshContext) {
  const tasks: Promise<unknown>[] = [];
  const detail: PageRefreshEventDetail = {
    ...context,
    addTask(task) {
      tasks.push(Promise.resolve(task));
    },
  };
  window.dispatchEvent(new CustomEvent<PageRefreshEventDetail>(PAGE_REFRESH_EVENT, { detail }));
  return tasks;
}

export function usePageRefreshHandler(
  predicate: (detail: PageRefreshEventDetail) => boolean,
  handler: (detail: PageRefreshEventDetail) => PageRefreshTask,
) {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<PageRefreshEventDetail>).detail;
    if (!detail || !predicate(detail)) {
      return;
    }
    detail.addTask(handler(detail));
  };

  onMounted(() => {
    window.addEventListener(PAGE_REFRESH_EVENT, listener);
  });

  onBeforeUnmount(() => {
    window.removeEventListener(PAGE_REFRESH_EVENT, listener);
  });
}
