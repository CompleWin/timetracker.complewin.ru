import { estimateClockOffset } from "@stt/shared";
import { onMounted, onUnmounted, ref, type Ref } from "vue";

const TICK_MS = 1000;

let offsetMs = 0;

export function rememberServerNow(
  serverNow: string | null,
  sentAtMs: number,
  receivedAtMs: number,
): void {
  const serverMs = serverNow === null ? Number.NaN : Date.parse(serverNow);
  if (Number.isFinite(serverMs)) {
    offsetMs = estimateClockOffset({ sentAtMs, receivedAtMs, serverNowMs: serverMs });
  }
}

export function serverNowMs(): number {
  return Date.now() + offsetMs;
}

export function useServerNow(): Ref<number> {
  const now = ref(serverNowMs());
  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => {
    timer = setInterval(() => (now.value = serverNowMs()), TICK_MS);
  });
  onUnmounted(() => clearInterval(timer));
  return now;
}
