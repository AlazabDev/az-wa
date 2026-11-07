import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath) => readFileSync(resolve(root, relativePath), "utf8");

test("AzWA runtime is TanStack Start, not Next.js or React Router", () => {
  const pkg = JSON.parse(read("package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of ["next", "next-intl", "react-router-dom", "@novu/nextjs"]) {
    assert.equal(deps[name], undefined, `Obsolete runtime dependency: ${name}`);
  }
  for (const name of ["@tanstack/react-router", "@tanstack/react-start", "@tanstack/router-plugin"]) {
    assert.ok(deps[name], `Missing approved runtime dependency: ${name}`);
  }
  assert.match(read("src/router.tsx"), /routeTree\.gen/);
  assert.match(read("vite.config.ts"), /node-server/);
});

test("non-TanStack imports do not enter the active route dependency graph", () => {
  const output = execFileSync(process.execPath, ["scripts/integration-boundary.mjs"], {
    cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
  });
  assert.match(output, /PASS: no Next\.js or legacy flow dependency/);
});
