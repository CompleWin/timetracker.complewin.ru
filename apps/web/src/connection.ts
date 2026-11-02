import { readonly, ref } from "vue";

type ReconnectListener = () => void;

const online = ref(navigator.onLine);
const reconnectListeners = new Set<ReconnectListener>();

window.addEventListener("online", markOnline);
window.addEventListener("offline", markOffline);

export const isOnline = readonly(online);

export function markOffline(): void {
  online.value = false;
}

export function markOnline(): void {
  if (online.value) return;
  online.value = true;
  reconnectListeners.forEach((listener) => listener());
}

export function onReconnect(listener: ReconnectListener): () => void {
  reconnectListeners.add(listener);
  return () => reconnectListeners.delete(listener);
}
