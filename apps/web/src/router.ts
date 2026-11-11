import { createRouter, createWebHistory, type RouteLocationNormalized } from "vue-router";
import { onReconnect } from "./connection.ts";
import { privacyPolicy, termsOfUse } from "./legal-documents.ts";
import ArchivePage from "./pages/ArchivePage.vue";
import LegalPage from "./pages/LegalPage.vue";
import LoginPage from "./pages/LoginPage.vue";
import RootPage from "./pages/RootPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";
import TaskPage from "./pages/TaskPage.vue";
import TasksPage from "./pages/TasksPage.vue";
import { useSessionStore } from "./stores/session.ts";

const LOGIN_PATH = "/login";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: RootPage, meta: { narrow: true, public: true } },
    { path: "/archive", component: ArchivePage, meta: { narrow: true } },
    { path: "/tasks", component: TasksPage, meta: { narrow: true } },
    { path: "/tasks/:id", component: TaskPage, props: true },
    { path: "/settings", component: SettingsPage },
    {
      path: "/privacy",
      component: LegalPage,
      props: { document: privacyPolicy },
      meta: { public: true, outsideMenu: true },
    },
    {
      path: "/terms",
      component: LegalPage,
      props: { document: termsOfUse },
      meta: { public: true, outsideMenu: true },
    },
    { path: LOGIN_PATH, component: LoginPage, meta: { public: true } },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  await session.ensureLoaded();
  if (to.meta.public === true || session.user !== null || session.unverified) return true;
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
