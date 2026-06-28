import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// Zero-Worker static deployment. All catalog data, TMDB metadata, and pre-signed
// images come from the VPS catalog-api at img.bluesia.net/api/* (fetched
// client-side by the React islands). No SSR, no Cloudflare adapter.
export default defineConfig({
  output: "static",
  site: "https://film.bluesia.net",
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    cacheDir: process.env.VITE_CACHE_DIR || ".vite-cache-build"
  }
});
