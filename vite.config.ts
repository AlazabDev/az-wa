import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Inside the Lovable sandbox the wrapper pins the build to cloudflare-module
// with dist/ output regardless of this option. On the self-hosted server
// (wa.alazab.com) the sandbox override is absent, so the explicit
// node-server preset applies and nitro emits .output/server/index.mjs,
// which deploy/ecosystem.config.cjs runs under PM2.
export default defineConfig({
  plugins: [tsconfigPaths(), tailwindcss()],
  nitro: { preset: "node-server" },
});
