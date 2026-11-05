import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const read = (name) => fs.readFileSync(path.join(cwd, name), "utf8");
const catalog = read("src/lib/azwa-integration-catalog.ts");
const ui = read("src/components/azwa/integration-directory.tsx");
const credentials = read("src/routes/_authenticated/credentials.tsx");
const settings = read("src/routes/_authenticated/settings.tsx");
const recordFn = read("src/lib/record-table.functions.ts");

function actionPaths() {
  return [...catalog.matchAll(/\bto: \"(\/[^\"]+)\"/g)].map((m) => m[1]);
}

test("all integration and support links point to existing authenticated TanStack pages", () => {
  const paths = actionPaths();
  assert.ok(paths.length >= 10);
  for (const endpoint of paths) {
    assert.match(endpoint, /^\/[a-z][a-z-]*$/);
    assert.ok(fs.existsSync(path.join(cwd, "src/routes/_authenticated", `${endpoint.slice(1)}.tsx`)), endpoint);
  }
});

test("credential display uses privileged server read contract and allowlisted safe fields", () => {
  assert.match(credentials, /table="meta_credentials"/);
  assert.match(recordFn, /permission: "credentials\.manage"/);
  const allowed = recordFn.match(/meta_credentials: \{[\s\S]*?safeColumns:\s*"([^"]+)"/);
  assert.ok(allowed, "safe allowlist exists");
  for (const disallowed of ["access_token", "secret_key", "token_value", "token_ciphertext", "refresh_token"]) {
    assert.ok(!allowed[1].split(",").map(x => x.trim()).includes(disallowed), `safe columns exposed ${disallowed}`);
  }
});

test("integration directory and help are wired into existing routes, not new mock endpoints", () => {
  assert.match(credentials, /<IntegrationDirectory \/>/);
  assert.match(settings, /<OperationalHelp \/>/);
  assert.match(ui, /searchAzwaHelp\(query\)/);
  assert.match(ui, /<Link to=\{action\.to\}/);
  assert.match(ui, /await navigator\.clipboard\.writeText\(name\)/);
  assert.match(ui, /catch \{/);
});

test("UI does not pretend an unverified integration is healthy", () => {
  assert.match(catalog, /configuration-only/);
  assert.match(catalog, /لم يُتحقق من وجود اتصال حي/);
  assert.doesNotMatch(ui, /Connected|تم الاتصال بنجاح|كل الخدمات متصلة/);
  assert.doesNotMatch(ui, /import\.meta\.env|VITE_.*TOKEN|localStorage/);
});

test("no duplicate API key management routes were introduced", () => {
  assert.equal(fs.existsSync(path.join(cwd, "src/routes/_authenticated/api-keys.tsx")), false);
  assert.equal(fs.existsSync(path.join(cwd, "src/routes/_authenticated/integrations.tsx")), false);
});
