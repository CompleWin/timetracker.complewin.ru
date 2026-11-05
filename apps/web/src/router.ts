import { createRouter, createWebHistory, type RouteLocationNormalized } from "vue-router";
import { onReconnect } from "./connection.ts";
import ArchivePage from "./pages/ArchivePage.vue";
import HomePage from "./pages/HomePage.vue";
import LoginPage from "./pages/LoginPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";
import TaskPage from "./pages/TaskPage.vue";
import { useSessionStore } from "./stores/session.ts";

const LOGIN_PATH = "/login";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomePage, meta: { narrow: true } },
    { path: "/archive", component: ArchivePage, meta: { narrow: true } },
    { path: "/tasks/:id", component: TaskPage, props: true },
    { path: "/settings", component: SettingsPage },
    { path: LOGIN_PATH, component: LoginPage },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  await session.ensureLoaded();
  if (to.path === LOGIN_PATH || session.user !== null || session.unverified) return true;
  return loginRedirect(to);
});

onReconnect(recheckSession);

function loginRedirect(to: RouteLocationNormalized) {
  return { path: LOGIN_PATH, query: { returnTo: to.fullPath } };
}

function recheckSession(): void {
  if (!useSessionStore().unverified) return;
  const { path, query, hash } = router.currentRoute.value;
  void router.replace({ path, query, hash, force: true });
}
