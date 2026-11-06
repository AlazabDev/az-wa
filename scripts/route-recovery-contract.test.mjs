import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSavedScope, numbersInScope } from "../src/lib/scope.tsx";

const read = (path) => readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

test("corrupted or outdated local scope state cannot crash navigation", () => {
  for (const raw of [null, "", "broken-json", "null", "[]", "{}", '{"kind":"number","id":42}', '{"kind":"other","id":"123"}']) {
    assert.equal(parseSavedScope(raw), null);
  }
  assert.equal(parseSavedScope('{"kind":"all","id":null,"label":"any"}')?.kind, "all");
  assert.equal(numbersInScope([{ id: "1", waba_id: "w", business_portfolio_id: "b" }], {
    kind: "number", id: null, label: "broken",
  }).length, 0);
});

test("production routing has explicit recovery boundaries for root, auth and defaults", () => {
  const root = read("src/routes/__root.tsx");
  const auth = read("src/routes/_authenticated/route.tsx");
  const router = read("src/router.tsx");
  const boundary = read("src/components/azwa/route-error.tsx");
  assert.match(root, /errorComponent: RouteErrorRecovery/);
  assert.match(auth, /errorComponent: RouteErrorRecovery/);
  assert.match(router, /defaultErrorComponent: RouteErrorRecovery/);
  assert.match(boundary, /تعذر تحميل هذه الصفحة/);
  assert.match(boundary, /reset\(\)/);
  assert.doesNotMatch(boundary, /error\.stack|error\.message/);
});

test("temporary backend failures must not sign the user out or mislabel them as unauthorized", () => {
  const auth = read("src/routes/_authenticated/route.tsx");
  const provider = read("src/lib/scope.tsx");
  assert.doesNotMatch(auth, /supabase\.auth\.signOut\(/);
  assert.match(auth, /if \(result === null\)/);
  assert.match(auth, /if \(status === 401 \|\| status === 403\)/);
  assert.match(auth, /const scopes = await getAuthenticatedOrganizationScopes/);
  assert.match(provider, /try \{[\s\S]*?window\.localStorage\.getItem/);
  assert.match(provider, /try \{[\s\S]*?window\.localStorage\.setItem/);
});
