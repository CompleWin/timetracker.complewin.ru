import { safeReturnTo } from "@stt/shared";
import { computed } from "vue";
import { useRoute } from "vue-router";

export function useGuestSignIn() {
  const route = useRoute();
  const returnTo = computed(() => {
    const value = route.query.returnTo;
    return safeReturnTo(typeof value === "string" ? value : undefined);
  });
  const telegramStartUrl = computed(
    () => `/auth/telegram/start?${new URLSearchParams({ returnTo: returnTo.value })}`,
  );
  return { returnTo, telegramStartUrl };
}
