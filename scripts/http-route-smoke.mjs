#!/usr/bin/env node
/**
 * Boots the freshly built Nitro server, then probes its public/auth-entry
 * responses. This does not replace authenticated browser/Meta integration E2E.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const entry = resolve(".output/server/index.mjs");
if (!existsSync(entry)) throw new Error("Missing Nitro production server output");

const port = 18733;
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  PORT: String(port),
  HOST: "127.0.0.1",
  NODE_ENV: "production",
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://ci-placeholder.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "ci-publishable-key",
  SUPABASE_URL: process.env.SUPABASE_URL || "https://ci-placeholder.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || "ci-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "ci-service-role-placeholder",
};
const proc = spawn(process.execPath, [entry], {
  env, stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
for (const stream of [proc.stdout, proc.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    output = (output + chunk).slice(-15000);
  });
}
const abort = new AbortController();
async function probe(path) {
  const response = await fetch(base + path, { signal: abort.signal, redirect: "manual" });
  const html = await response.text();
  if (response.status >= 500) {
    throw new Error(`${path}: HTTP ${response.status}; body: ${html.slice(0, 350)}`);
  }
  if (response.status < 200 || response.status >= 400) {
    throw new Error(`${path}: unexpected HTTP ${response.status}`);
  }
  if (/This page didn't load|Something went wrong on our end/i.test(html)) {
    throw new Error(`${path}: generic fatal fallback rendered`);
  }
  console.log(`PASS: ${path} => HTTP ${response.status}`);
}

try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (proc.exitCode !== null) break;
    try {
      const r = await fetch(base + "/auth", { signal: AbortSignal.timeout(1500), redirect: "manual" });
      if (r.status < 500) { ready = true; break; }
    } catch {
      // Server is starting.
    }
    await sleep(250);
  }
  if (!ready) throw new Error(`Nitro failed to serve requests. Output: ${output}`);
  for (const path of ["/auth", "/", "/dashboard", "/inbox", "/settings"]) {
    await probe(path);
  }
  console.log("AZWA built-server HTTP smoke PASS");
} catch (error) {
  console.error("AZWA built-server HTTP smoke FAILED:", error);
  console.error("Last server output:", output);
  process.exitCode = 1;
} finally {
  abort.abort();
  proc.kill("SIGTERM");
}
