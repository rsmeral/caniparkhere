import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Lets `vite dev` be reached through an ad-hoc `cloudflared tunnel --url` quick tunnel
  // for phone testing (real HTTPS, needed for the Geolocation API) - dev-server only,
  // has no effect on the production build or how it's served.
  server: {
    allowedHosts: [".trycloudflare.com"],
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png"],
      workbox: {
        // Data files are versioned via manifest.json + IndexedDB ourselves,
        // so let the service worker just cache the app shell.
        globPatterns: ["**/*.{js,css,html,png}"],
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
