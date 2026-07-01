// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://tabakgrosist.mk",
  integrations: [sitemap()],
  vite: {
    // Cast: @tailwindcss/vite ships its own Vite type copy which trips
    // astro check's structural comparison; harmless, build is unaffected.
    plugins: [/** @type {any} */ (tailwindcss())],
  },
});
