import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";

export default defineConfig({
  site: "https://skillz.sh",
  output: "static",
  integrations: [react(), mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
