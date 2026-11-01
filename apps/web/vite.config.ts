import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const WORKER_URL = "http://localhost:8787";
const WORKER_PREFIXES = ["/api/", "/auth/", "/notion/", "/tg/", "/__test/"];

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: Object.fromEntries(WORKER_PREFIXES.map((prefix) => [prefix, WORKER_URL])),
  },
});
