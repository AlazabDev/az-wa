import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath) => readFileSync(resolve(root, relativePath), "utf8");

test("every primary sidebar destination resolves to a TanStack route module", () => {
  const shell = read("src/components/azwa/app-shell.tsx");
  const sidebar = [...shell.matchAll(/\{ label:\s*"[^"]+",\s*to:\s*"(\/[a-z-]+)"/g)]
    .map((match) => match[1]);
  assert.ok(sidebar.length >= 29, "expected full operational sidebar");
  assert.equal(new Set(sidebar).size, sidebar.length, "duplicate sidebar destinations");
  for (const route of sidebar) {
    assert.ok(
      existsSync(resolve(root, "src/routes/_authenticated", route.slice(1) + ".tsx")),
      `Missing live route for ${route}`,
    );
  }
});

test("active routes do not reference deleted React Router entrypoints or placeholders", () => {
  const shell = read("src/components/azwa/app-shell.tsx");
  const router = read("src/router.tsx");
  assert.doesNotMatch(shell, /react-router-dom|href="#"/);
  assert.doesNotMatch(router, /react-router-dom/);
  assert.match(router, /routeTree\.gen/);
  const scopeSelector = read("src/components/azwa/scope-selector.tsx");
  assert.match(scopeSelector, /useScope/);
  assert.doesNotMatch(scopeSelector, /meta_phone_number_id|meta_waba_id/);
});
