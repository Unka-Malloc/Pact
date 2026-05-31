import { computed, ref } from "vue";

export function createConsoleAgentExploreLayoutController() {
  const agentExploreSplitRef = ref<HTMLElement | null>(null);
  const agentExploreSplitDragging = ref(false);
  const agentExploreSplitLeftPercent = ref(42);
  const agentExploreTraceOpen = ref(true);

  const agentExploreSplitStyle = computed<Record<string, string>>(() => ({
    "--agent-explore-left": `${agentExploreSplitLeftPercent.value}%`,
  }));

  function clampAgentExploreSplitPercent(value: number) {
    return Math.max(28, Math.min(Number.isFinite(value) ? value : 42, 68));
  }

  function updateAgentExploreSplitFromClientX(clientX: number) {
    const element = agentExploreSplitRef.value;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    agentExploreSplitLeftPercent.value = clampAgentExploreSplitPercent(
      ((clientX - rect.left) / rect.width) * 100,
    );
  }

  function stopAgentExploreSplitResize() {
    if (typeof document !== "undefined") {
      document.removeEventListener("pointermove", handleAgentExploreSplitPointerMove);
      document.removeEventListener("pointerup", stopAgentExploreSplitResize);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    agentExploreSplitDragging.value = false;
  }

  function handleAgentExploreSplitPointerMove(event: PointerEvent) {
    updateAgentExploreSplitFromClientX(event.clientX);
  }

  function startAgentExploreSplitResize(event: PointerEvent) {
    event.preventDefault();
    agentExploreSplitDragging.value = true;
    updateAgentExploreSplitFromClientX(event.clientX);
    document.addEventListener("pointermove", handleAgentExploreSplitPointerMove);
    document.addEventListener("pointerup", stopAgentExploreSplitResize);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function handleAgentExploreSplitKeydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 5 : 2;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      agentExploreSplitLeftPercent.value = clampAgentExploreSplitPercent(
        agentExploreSplitLeftPercent.value - step,
      );
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      agentExploreSplitLeftPercent.value = clampAgentExploreSplitPercent(
        agentExploreSplitLeftPercent.value + step,
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      agentExploreSplitLeftPercent.value = 28;
    } else if (event.key === "End") {
      event.preventDefault();
      agentExploreSplitLeftPercent.value = 68;
    }
  }

  function handleAgentExploreTraceToggle(event: Event) {
    agentExploreTraceOpen.value = Boolean((event.currentTarget as HTMLDetailsElement | null)?.open);
  }

  return {
    agentExploreSplitDragging,
    agentExploreSplitLeftPercent,
    agentExploreSplitRef,
    agentExploreSplitStyle,
    agentExploreTraceOpen,
    clampAgentExploreSplitPercent,
    handleAgentExploreSplitKeydown,
    handleAgentExploreSplitPointerMove,
    handleAgentExploreTraceToggle,
    startAgentExploreSplitResize,
    stopAgentExploreSplitResize,
    updateAgentExploreSplitFromClientX,
  };
}
