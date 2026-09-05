import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 8082,
  },
  plugins: [
    tsconfigPaths(),
    tanstackStart(),
    nitro({ preset: "node-server" }),
    viteReact(),
    tailwindcss(),
  ],
});
