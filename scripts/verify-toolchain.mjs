import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const major = Number(process.versions.node.split(".")[0]);
const errors = [];
if (major < 24) errors.push(`Node.js >=24 required; found ${process.version}`);
if (!existsSync(resolve(root, "bun.lock"))) errors.push("Missing canonical bun.lock");
if (existsSync(resolve(root, "package-lock.json"))) errors.push("Unexpected root package-lock.json alongside bun.lock");
if (existsSync(resolve(root, "pnpm-lock.yaml"))) errors.push("Unexpected root pnpm-lock.yaml alongside bun.lock");
if (!/^bun@\d+\.\d+\.\d+$/.test(pkg.packageManager ?? "")) errors.push("packageManager must pin Bun");
const expectedBun = String(pkg.packageManager ?? "").replace(/^bun@/, "");
try {
  const actualBun = execFileSync("bun", ["--version"], { encoding: "utf8" }).trim();
  if (actualBun !== expectedBun) {
    errors.push(`Bun version mismatch: manifest requires ${expectedBun}, installed ${actualBun}`);
  }
} catch {
  errors.push("Bun executable is missing or its version cannot be determined");
}
if (errors.length) {
  console.error("AZWA toolchain verification FAILED\n" + errors.map(x => ` - ${x}`).join("\n"));
  process.exit(1);
}
console.log(`AZWA toolchain verification PASS: Node ${process.version}, ${pkg.packageManager}`);
