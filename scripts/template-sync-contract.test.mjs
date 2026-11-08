import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nextTemplateCursor, validateTemplatePage, MAX_TEMPLATE_PAGES } from "../src/lib/meta/template-sync-pagination.ts";

const read = (file) => readFileSync(resolve(import.meta.dirname, "..", file), "utf8");
const valid = { id: "meta-101", name: "welcome", language: "ar", status: "APPROVED" };

test("Meta template listing accepts complete valid pages and zero-template WABAs", () => {
  assert.deepEqual(validateTemplatePage({ data: [valid] }), [valid]);
  assert.deepEqual(validateTemplatePage({ data: [], paging: {} }), []);
  assert.equal(MAX_TEMPLATE_PAGES, 100);
});

test("bad or incomplete Graph pages never publish a successful snapshot", () => {
  assert.throws(() => validateTemplatePage(null), /invalid template listing/);
  assert.throws(() => validateTemplatePage({}), /invalid template listing/);
  assert.throws(() => validateTemplatePage({ data: [{ name: "bad", language: "ar" }] }), /without id/);
  const seen = new Set();
  assert.equal(nextTemplateCursor({ data: [valid], paging: { next: "https://graph.facebook.com/?after=abc", cursors: { after: "abc" } } }, seen), "abc");
  assert.throws(() => nextTemplateCursor({ data: [], paging: { next: "again", cursors: { after: "abc" } } }, seen), /repeated/);
  assert.throws(() => nextTemplateCursor({ data: [], paging: { next: "next" } }, new Set()), /missing/);
  assert.equal(nextTemplateCursor({ data: [], paging: {} }, new Set()), undefined);
});

test("all WABA sync is an authenticated, permission-checked server action", () => {
  const service = read("src/lib/meta/templates.functions.ts");
  const server = read("src/lib/meta/templates.server.ts");
  const ui = read("src/routes/_authenticated/templates.tsx");
  assert.match(service, /export const syncAllTemplates = createServerFn/);
  assert.match(service, /\.middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(service, /await assertWabaPermission\(context\.supabase, waba\.id\)/);
  assert.match(service, /\.eq\("organization_id", orgId\)/);
  assert.match(service, /failedWabas/);
  assert.match(server, /validateTemplatePage\(response\.data\)/);
  assert.match(server, /nextTemplateCursor/);
  assert.match(server, /status: "deleted"/);
  assert.match(ui, /handleSyncAll/);
  assert.match(ui, /مزامنة جميع حسابات WABA/);
});

test("template list is served by permission-scoped backend instead of direct browser Supabase query", () => {
  const client = read("src/lib/azwa-templates.ts");
  const server = read("src/lib/meta/templates.functions.ts");
  assert.match(client, /useServerFn\(listTemplates\)/);
  assert.doesNotMatch(client, /supabase\.from\("templates"\)/);
  assert.match(server, /p_permission: "templates.read"/);
  assert.match(server, /\.eq\("organization_id", orgId\)/);
});
