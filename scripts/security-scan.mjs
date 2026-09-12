import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, basename } from "node:path";

const root = process.cwd();
const output = execFileSync(
  "find",
  [".", "-type", "f", "-not", "-path", "./node_modules/*", "-not", "-path", "./.git/*", "-print0"],
  { cwd: root },
);
const paths = output.toString("utf8").split("\0").filter(Boolean);
const patterns = [
  ["JWT", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["Meta token", /EAA[A-Za-z0-9_-]{20,}/g],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9._-]{8,}/gi],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];
const sensitiveName =
  /(SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|ACCESS_KEY|PRIVATE_KEY|SERVICE_ROLE|VERIFY_TOKEN|APP_SECRET|CLIENT_SECRET)/i;
const hits = [];
for (const rel of paths) {
  const abs = resolve(root, rel);
  if (statSync(abs).size > 8_000_000) continue;
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  for (const [label, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) hits.push(`${label}: ${rel}`);
  }
  const name = basename(rel);
  if (name.startsWith(".env") || name.endsWith(".env")) {
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m || !sensitiveName.test(m[1])) continue;
      const value = m[2].trim().replace(/^['"]|['"]$/g, "");
      if (value && value !== "***REDACTED***" && !/^<.*>$/.test(value))
        hits.push(`Populated sensitive env value ${m[1]}: ${rel}`);
    }
  }
}
if (hits.length) {
  console.error("AZWA security scan FAILED");
  for (const hit of [...new Set(hits)]) console.error(` - ${hit}`);
  process.exit(1);
}
console.log("AZWA security scan PASS");
