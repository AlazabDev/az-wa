import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = path => readFileSync(resolve(root, path), "utf8");
const pkg = JSON.parse(read("package.json"));
const lock = read("bun.lock");
const workspace = lock.slice(lock.indexOf('"workspaces"'), lock.indexOf('"packages"'));

test("project uses a single pinned Bun lockfile", () => {
  assert.match(pkg.packageManager, /^bun@\d+\.\d+\.\d+$/);
  assert.ok(existsSync(resolve(root, "bun.lock")));
  assert.ok(!existsSync(resolve(root, "package-lock.json")));
  assert.ok(!existsSync(resolve(root, "pnpm-lock.yaml")));
});

test("workspace direct dependency declarations match canonical lock", () => {
  for (const group of ["dependencies", "devDependencies"]) {
    for (const [name, value] of Object.entries(pkg[group])) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`"${escaped}"\\s*:\\s*"([^"]+)"`);
      const match = workspace.match(pattern);
      assert.ok(match, `Missing locked dependency ${name}`);
      assert.equal(match[1], value, `${name} manifest-lock mismatch`);
    }
  }
});

test("production installer enforces frozen lockfile and preflight gates", () => {
  const deploy = read("deploy/deploy.sh");
  assert.match(deploy, /bun install --frozen-lockfile/);
  assert.match(deploy, /node scripts\/verify-toolchain\.mjs/);
  assert.doesNotMatch(deploy, /npm ci|package-lock\.json/);
});
