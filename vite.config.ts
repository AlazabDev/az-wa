// @lovable.dev/vite-tanstack-config already includes TanStack Start, React,
// Tailwind, path aliases and Nitro. Keep a single server runtime and override
// only the Nitro target needed by the self-hosted production container.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Route the server bundle through src/server.ts so catastrophic SSR errors
    // are normalized consistently.
    server: { entry: "server" },
  },
  nitro: {
    preset: "node-server",
  },
});
