import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

test("browser Supabase client is env-only", () => {
  const s = read("src/integrations/supabase/client.ts");
  assert.match(s, /VITE_SUPABASE_URL/);
  assert.match(s, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(s, /https:\/\/[a-z0-9]+\.supabase\.co/i);
});

test("production auth has no preview bypass", () => {
  const s = read("src/routes/_authenticated/route.tsx");
  assert.match(s, /supabase\.auth\.getUser/);
  assert.match(s, /getAuthenticatedOrganizationScopes/);
  assert.doesNotMatch(s, /preview|azwa_preview_session/i);
});

test("root does not forward errors to preview/editor telemetry", () => {
  const s = read("src/routes/__root.tsx");
  assert.doesNotMatch(s, /reportLovableError|gpteng|gptengineer|__lovable/i);
});

test("Meta webhook signature is fail-closed", () => {
  const s = read("src/routes/api/public/webhooks/meta/whatsapp.ts");
  assert.match(s, /!endpoint\s*\|\|\s*!signatureValid/);
  assert.match(s, /status:\s*401/);
});

test("legacy route source is isolated", () => {
  const names = readdirSync(resolve(root, "src/routes"));
  assert.equal(
    names.some((name) => name.startsWith("legacy")),
    false,
  );
});

test("file manager separates read and management permissions", () => {
  const s = read("src/lib/storage/files.functions.ts");
  assert.match(s, /media\.read/);
  assert.match(s, /media\.manage/);
  assert.match(s, /MEDIA_MANAGE_PERMISSION/);
  assert.ok(
    existsSync(resolve(root, "supabase/migrations/20260906000100_media_manage_permission.sql")),
  );
});

test("production deploy is deterministic and external-secret based", () => {
  const s = read("deploy/deploy.sh");
  assert.match(s, /\/etc\/az-wa\/az-wa\.env/);
  assert.match(s, /npm ci/);
  assert.doesNotMatch(s, /npm install --package-lock-only|npm install -g/);
  assert.match(s, /9d9a8c3c0f84ef7b4604e9b7a66925d1d554ecab/);
  assert.match(s, /Node\.js 24\+/);
  assert.match(s, /--apply-migrations/);
});

test("Nginx has dedicated logs and stable Meta callback", () => {
  const s = read("deploy/nginx/wa.alazab.com");
  assert.match(s, /wa\.alazab\.com\.access\.log/);
  assert.match(s, /wa\.alazab\.com\.error\.log/);
  assert.match(s, /location = \/webhooks\/meta\/whatsapp/);
  assert.match(s, /\/api\/public\/webhooks\/meta\/whatsapp/);
});

test("active migration inventory is forward-only and expected", () => {
  const names = readdirSync(resolve(root, "supabase/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort();
  assert.deepEqual(names, [
    "20260904000100_azwa_core_identity_meta.sql",
    "20260904000200_azwa_security_fk_indexes.sql",
    "20260904000300_azwa_meta_inventory_seed.sql",
    "20260904000400_azwa_complete_messaging_runtime.sql",
    "20260906000100_media_manage_permission.sql",
    "20260906000200_automation_rule_management.sql",
  ]);
});

test("runtime secret files are not bundled at project root", () => {
  for (const p of [".env", ".env.local", "meta/.env"]) {
    assert.equal(existsSync(resolve(root, p)), false, `${p} must not be bundled`);
  }
});
