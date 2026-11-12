import { onMounted, onUnmounted, ref, type Ref } from "vue";
import { DEMO_STILL_MS } from "./landing-demo.ts";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const MAX_FRAME_MS = 100;

export type DemoClock = {
  elapsed: Ref<number>;
  animated: boolean;
};

export function useDemoClock(
  target: Readonly<Ref<HTMLElement | null>>,
  onFrame: () => void,
): DemoClock {
  const animated = !window.matchMedia(REDUCED_MOTION_QUERY).matches;
  const elapsed = ref(animated ? 0 : DEMO_STILL_MS);
  let onScreen = true;
  let lastFrameAt = 0;
  let frame = 0;
  let observer: IntersectionObserver | undefined;

  function step(now: number): void {
    const frameMs = Math.min(MAX_FRAME_MS, Math.max(0, now - lastFrameAt));
    lastFrameAt = now;
    if (onScreen && !document.hidden) {
      elapsed.value += frameMs;
      onFrame();
    }
    frame = requestAnimationFrame(step);
  }

  onMounted(() => {
    if (!animated) return;
    observer = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
    });
    if (target.value !== null) observer.observe(target.value);
    lastFrameAt = performance.now();
    frame = requestAnimationFrame(step);
  });

  onUnmounted(() => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
  });

  return { elapsed, animated };
}
