import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Workbox computes this from the actual build output, so every
      // hashed JS/CSS/asset file for this exact build gets precached —
      // unlike a hand-written sw.js, offline works from the first cold
      // launch after install, not just after happening to load online once.
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2,ttf}"],
      },
      manifest: {
        name: "Peak",
        short_name: "Peak",
        description: "Offline-first workout tracker",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#0f0f0f",
        background_color: "#0f0f0f",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
