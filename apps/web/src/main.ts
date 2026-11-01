import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { i18n } from "./i18n.ts";
import { router } from "./router.ts";
import "./styles/main.css";

document.documentElement.lang = i18n.global.locale.value;

createApp(App).use(createPinia()).use(router).use(i18n).mount("#app");
