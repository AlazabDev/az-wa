import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("production security regression guards", () => {
  it("keeps Meta webhook fail-closed", () => {
    const source = read("supabase/functions/wa-webhook/index.ts");
    expect(source).toContain("if (!APP_SECRET || !signature?.startsWith");
    expect(source).not.toContain("if (!APP_SECRET || !signature) return true");
  });

  it("keeps finance fallback disabled by default", () => {
    const source = read("supabase/functions/_shared/foundry.ts");
    expect(source).toContain('FINANCE_ALLOW_AI_FALLBACK") ?? "false"');
  });

  it("uses tenant-scoped finance claims", () => {
    const worker = read("supabase/functions/finance-worker/index.ts");
    expect(worker).toContain("claim_finance_documents_scoped");
    expect(worker).toContain("_tenant_id: tenantId");
  });

  it("removes legacy get_user_role policies in production migration", () => {
    const migration = read(
      "supabase/migrations/20260821060000_production_security_and_finance_scope.sql",
    );
    expect(migration).toContain("get_user_role");
    expect(migration).toContain("is_tenant_member(tenant_id)");
    expect(migration).toContain("has_tenant_role(tenant_id, 'operator')");
  });
});
