import type { Locale, UpdateMeBody, User } from "@stt/shared";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import * as api from "../api.ts";
import { applyLocale } from "../i18n.ts";

export const useSessionStore = defineStore("session", () => {
  const user = ref<User | null>(null);
  const unverified = ref(false);
  const devSignInPending = ref(false);
  const savingShowGaps = ref(false);
  let loading: Promise<void> | undefined;

  const isGuest = computed(() => user.value === null && !unverified.value);

  function ensureLoaded(): Promise<void> {
    loading ??= loadCurrentUser();
    return loading;
  }

  async function loadCurrentUser(): Promise<void> {
    try {
      signedIn(await api.fetchCurrentUser());
      unverified.value = false;
    } catch (error) {
      if (!(error instanceof api.NetworkError)) return signedIn(null);
      unverified.value = true;
      loading = undefined;
    }
  }

  async function signInAsTestUser(navigate: () => Promise<unknown>): Promise<void> {
    devSignInPending.value = true;
    try {
      signedIn(await api.devLogin());
      await navigate();
    } finally {
      devSignInPending.value = false;
    }
  }

  async function signOut(): Promise<void> {
    await api.logout();
    user.value = null;
  }

  async function deleteAccount(): Promise<void> {
    await api.deleteAccount();
    user.value = null;
  }

  async function changeLocale(locale: Locale): Promise<void> {
    applyLocale(locale);
    await saveProfile({ locale });
  }

  async function changeReminderThreshold(reminderThresholdMin: number): Promise<void> {
    await saveProfile({ reminderThresholdMin });
  }

  async function changeShowGaps(showGaps: boolean): Promise<void> {
    const profile = user.value;
    if (profile === null || savingShowGaps.value || profile.showGaps === showGaps) return;
    savingShowGaps.value = true;
    user.value = { ...profile, showGaps };
    try {
      await api.updateMe({ showGaps });
    } catch (error) {
      if (user.value?.id === profile.id) {
        user.value = { ...user.value, showGaps: profile.showGaps };
      }
      throw error;
    } finally {
      savingShowGaps.value = false;
    }
  }

  async function refreshShowGaps(): Promise<void> {
    const profile = user.value;
    if (profile === null || savingShowGaps.value) return;
    const fresh = await api.fetchCurrentUser();
    if (user.value === profile && fresh?.id === profile.id && fresh.showGaps !== profile.showGaps) {
      user.value = { ...profile, showGaps: fresh.showGaps };
    }
  }

  function signedIn(signedInUser: User | null): void {
    user.value = signedInUser;
    if (signedInUser === null) return;
    applyLocale(signedInUser.locale);
    syncTimezone(signedInUser).catch(() => undefined);
  }

  async function syncTimezone({ timezone }: User): Promise<void> {
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimezone !== timezone) await saveProfile({ timezone: browserTimezone });
  }

  async function saveProfile(changes: UpdateMeBody): Promise<void> {
    if (user.value !== null) user.value = { ...user.value, ...changes };
    await api.updateMe(changes);
  }

  return {
    user,
    unverified,
    isGuest,
    devSignInPending,
    savingShowGaps,
    ensureLoaded,
    signInAsTestUser,
    signOut,
    deleteAccount,
    changeLocale,
    changeReminderThreshold,
    changeShowGaps,
    refreshShowGaps,
  };
});
