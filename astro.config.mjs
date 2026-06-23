import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";

export default defineConfig({
  output: "server",
  site: "https://film.bluesia.net",
  integrations: [react()],
  adapter: cloudflare({
    imageService: "passthrough"
  }),
  vite: {
    define: {
      "import.meta.env.PUBLIC_SNAPSHOT_BASE_URL": JSON.stringify(process.env.PUBLIC_SNAPSHOT_BASE_URL || "")
    },
    cacheDir: process.env.VITE_CACHE_DIR || ".vite-cache-build",
    resolve: {
      alias: {
        "@": new URL(".", import.meta.url).pathname,
        ...(process.env.NODE_ENV === "production" ? { "react-dom/server": "react-dom/server.edge" } : {})
      }
    }
  }
});
