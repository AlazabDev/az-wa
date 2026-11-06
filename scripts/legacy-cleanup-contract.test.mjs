import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const legacy = [
  "src/App.tsx", "src/main.tsx", "src/App.css", "src/index.css",
  "src/components/AppLayout.tsx", "src/components/AppSidebar.tsx",
  "src/components/DashboardLayout.tsx", "src/components/NavLink.tsx",
  "src/components/ProtectedRoute.tsx", "src/components/ErrorBoundary.tsx",
  "src/components/WorkspaceUI.tsx", "src/components/DraftManager.tsx",
  "src/components/KPICard.tsx", "src/components/themed-toaster.tsx",
  "src/components/SendTemplateModal.tsx", "src/contexts/AuthContext.tsx",
  "src/integrations/supabase/legacy-client.ts",
  "src/hooks/useWorkspaceData.ts", "src/hooks/useWorkspaceDrafts.ts",
];
test("React Router SPA entrypoints and replaced shared components are absent", () => {
  for (const file of legacy) assert.equal(existsSync(resolve(root, file)), false, file);
  assert.equal(existsSync(resolve(root, "src/pages")), false, "src/pages must not be active");
});
test("active media uses authenticated organization scopes instead of retired AuthContext", () => {
  const adapter = readFileSync(resolve(root, "src/hooks/use-tenant.ts"), "utf8");
  const media = readFileSync(resolve(root, "src/hooks/use-media-url.ts"), "utf8");
  assert.match(adapter, /getAuthenticatedOrganizationScopes/);
  assert.doesNotMatch(adapter, /contexts\\/AuthContext|tenant_members/);
  assert.match(media, /useTenant/);
});

test("replacements remain wired into the live TanStack routes", () => {
  const settings = readFileSync(resolve(root, "src/routes/_authenticated/settings.tsx"), "utf8");
  const templates = readFileSync(resolve(root, "src/routes/_authenticated/templates.tsx"), "utf8");
  const router = readFileSync(resolve(root, "src/router.tsx"), "utf8");
  assert.match(settings, /<MetaDocumentation \/>/);
  assert.match(settings, /<OperationalHelp \/>/);
  assert.match(templates, /useServerFn\(readRecordTable\)/);
  assert.match(templates, /useServerFn\(sendTemplateMessage\)/);
  assert.match(router, /routeTree\.gen/);
  assert.doesNotMatch(router, /react-router-dom/);
});
