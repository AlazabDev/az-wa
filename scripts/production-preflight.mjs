import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "package.json",
  "vite.config.ts",
  "src/router.tsx",
  "src/routes/healthz.ts",
  "src/routes/readyz.ts",
  "src/routes/api/public/webhooks/meta/whatsapp.ts",
  "deploy/ecosystem.config.cjs",
  "deploy/nginx/wa.alazab.com",
  "supabase/migrations/20260906000100_media_manage_permission.sql",
  "supabase/migrations/20260906000200_automation_rule_management.sql",
];
for (const path of required) if (!existsSync(resolve(root, path))) failures.push(`missing ${path}`);

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 24) failures.push(`Node ${process.version} detected; Node 24+ is required`);

const routesDir = resolve(root, "src/routes");
if (existsSync(routesDir)) {
  const legacy = readdirSync(routesDir).filter((name) => name.startsWith("legacy"));
  if (legacy.length) failures.push(`legacy routes remain active: ${legacy.join(", ")}`);
}

const client = readFileSync(resolve(root, "src/integrations/supabase/client.ts"), "utf8");
if (/https:\/\/[a-z0-9]+\.supabase\.co/i.test(client))
  failures.push("hard-coded Supabase URL in browser client");
if (client.includes("azwa_preview_session"))
  failures.push("preview authentication remains in browser client");

const webhook = readFileSync(
  resolve(root, "src/routes/api/public/webhooks/meta/whatsapp.ts"),
  "utf8",
);
if (!/!endpoint\s*\|\|\s*!signatureValid/.test(webhook))
  failures.push("Meta webhook signature guard is not fail-closed");

if (failures.length) {
  console.error("AZWA production preflight FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("AZWA production preflight PASS");
