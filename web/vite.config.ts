import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Lets `vite dev` and `vite preview` be reached through an ad-hoc `cloudflared tunnel
  // --url` quick tunnel for phone testing (real HTTPS, needed for the Geolocation API).
  // Both are local-serving options only, with no effect on the production build itself.
  // Preview is the one to point a phone at when the service worker and the query worker's
  // built chunk are part of what's being tested.
  server: {
    allowedHosts: [".trycloudflare.com"],
  },
  preview: {
    allowedHosts: [".trycloudflare.com"],
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "emoji/*.svg"],
      workbox: {
        // Data files are versioned via manifest.json + IndexedDB ourselves,
        // so let the service worker just cache the app shell.
        globPatterns: ["**/*.{js,css,html,png,svg}"],
      },
      manifest: {
        name: "Can I Park Here",
        short_name: "ParkHere",
        description: "Is it OK to park here right now, in Prague?",
        theme_color: "#22c55e",
        background_color: "#22c55e",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/icons/icon.png", sizes: "400x400", type: "image/png", purpose: "any" }],
      },
    }),
  ],
});
