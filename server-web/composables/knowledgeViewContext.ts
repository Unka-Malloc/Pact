import { inject, provide, type InjectionKey } from "vue";
import type { useKnowledgeViewConsole } from "./useKnowledgeViewConsole";

export type KnowledgeViewContext = ReturnType<typeof useKnowledgeViewConsole>;

const knowledgeViewKey = Symbol("knowledge-view") as InjectionKey<KnowledgeViewContext>;

export function provideKnowledgeView(context: KnowledgeViewContext) {
  provide(knowledgeViewKey, context);
}

export function useKnowledgeViewContext() {
  const context = inject(knowledgeViewKey);
  if (!context) {
    throw new Error("Knowledge view context is not available");
  }
  return context;
}
