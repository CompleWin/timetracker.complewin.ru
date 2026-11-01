import { createRouter, createWebHistory, type RouteLocationNormalized } from "vue-router";
import ArchivePage from "./pages/ArchivePage.vue";
import HomePage from "./pages/HomePage.vue";
import LoginPage from "./pages/LoginPage.vue";
import { useSessionStore } from "./stores/session.ts";

const LOGIN_PATH = "/login";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomePage },
    { path: "/archive", component: ArchivePage },
    { path: LOGIN_PATH, component: LoginPage },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  await session.ensureLoaded();
  if (to.path === LOGIN_PATH || session.user !== null) return true;
  return loginRedirect(to);
});

function loginRedirect(to: RouteLocationNormalized) {
  return { path: LOGIN_PATH, query: { returnTo: to.fullPath } };
}
