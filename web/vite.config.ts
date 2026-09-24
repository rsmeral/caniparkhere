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
        // What a launcher labels the installed app with, and what Firefox offers at the
        // install prompt. Kept short because launchers truncate past about 12 characters.
        short_name: "Can I Park?",
        description: "Is it OK to park here right now, in Prague?",
        // The status bar an installed window paints above the app. It reads as chrome
        // rather than as one of the tones, since a single fixed colour can only ever match
        // one of them - this is the same neutral as the splash below.
        theme_color: "#1f2937",
        // The splash while the app boots. Deliberately neutral: the app's own background
        // is whichever tone the answer turns out to warrant, and this shows before there
        // is an answer.
        background_color: "#1f2937",
        display: "standalone",
        start_url: "/",
        // The maskable icon is what keeps a launcher from shrinking the plate onto a
        // backdrop of its own: it is opaque to the edges and keeps the artwork inside the
        // 80% safe zone, so an adaptive icon of any shape can crop it directly.
        icons: [
          { src: "/icons/icon.png", sizes: "400x400", type: "image/png", purpose: "any" },
          {
            src: "/icons/icon-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
