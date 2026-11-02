import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA, type ManifestOptions } from "vite-plugin-pwa";

const WORKER_URL = "http://localhost:8787";
const WORKER_PREFIXES = ["/api/", "/auth/", "/notion/", "/tg/", "/__test/"];

const manifest: Partial<ManifestOptions> = {
  name: "SimpleTimeTracker",
  short_name: "Трекер",
  lang: "ru",
  start_url: "/",
  display: "standalone",
  background_color: "#F3F2F2",
  theme_color: "#125B3A",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      manifest,
      workbox: {
        globPatterns: ["**/*.{html,js,css,woff2,png,svg}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: WORKER_PREFIXES.map((prefix) => new RegExp(`^${prefix}`)),
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: Object.fromEntries(WORKER_PREFIXES.map((prefix) => [prefix, WORKER_URL])),
  },
});
