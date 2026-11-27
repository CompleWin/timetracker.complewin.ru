import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA, type ManifestOptions } from "vite-plugin-pwa";

const WORKER_URL = "http://localhost:8787";
const WORKER_PREFIXES = ["/api/", "/auth/", "/notion/", "/tg/", "/__test/"];
const SEO_PATHS = ["/robots.txt", "/sitemap.xml"];

const manifest: Partial<ManifestOptions> = {
  name: "SimpleTimeTracker",
  short_name: "SimpleTimeTracker",
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
        directoryIndex: null,
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request, sameOrigin, url }) =>
              sameOrigin &&
              request.mode === "navigate" &&
              !/^\/(?:api|auth|notion|tg|__test)(?:\/|$)/.test(url.pathname) &&
              !/^\/(?:robots\.txt|sitemap\.xml)$/.test(url.pathname),
            handler: "NetworkOnly",
            options: { precacheFallback: { fallbackURL: "/index.html" } },
          },
        ],
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: Object.fromEntries(
      [...WORKER_PREFIXES, ...SEO_PATHS].map((prefix) => [prefix, WORKER_URL]),
    ),
  },
});
