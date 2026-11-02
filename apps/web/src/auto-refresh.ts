import { onMounted, onUnmounted } from "vue";
import { NetworkError } from "./api.ts";
import { onReconnect } from "./connection.ts";

const POLL_INTERVAL_MS = 20_000;

export function useAutoRefresh(refresh: () => Promise<void>): void {
  let refreshing = false;
  let poll: ReturnType<typeof setInterval> | undefined;
  let stopListeningReconnect: (() => void) | undefined;

  async function refreshOnce(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    try {
      await refresh();
    } catch (error) {
      if (!(error instanceof NetworkError)) throw error;
    } finally {
      refreshing = false;
    }
  }

  function refreshIfVisible(): void {
    if (document.visibilityState === "visible") void refreshOnce();
  }

  onMounted(() => {
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    poll = setInterval(refreshIfVisible, POLL_INTERVAL_MS);
    stopListeningReconnect = onReconnect(refreshIfVisible);
  });

  onUnmounted(() => {
    window.removeEventListener("focus", refreshIfVisible);
    document.removeEventListener("visibilitychange", refreshIfVisible);
    clearInterval(poll);
    stopListeningReconnect?.();
  });
}
