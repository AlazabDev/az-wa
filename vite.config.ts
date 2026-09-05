import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// The Lovable wrapper pins the preview/build shape the platform expects.
// Self-hosted production deploys (wa.alazab.com) target Node by exporting
// NITRO_PRESET=node-server before `bun run build`, which nitro honours.
export default defineConfig({
  plugins: [tsconfigPaths(), tailwindcss()],
  nitro: true,
});
