import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncBusinessPortfolioComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { portfolioId: string }) => {
    if (!input?.portfolioId) throw new Error("Business Portfolio is required");
    return { portfolioId: input.portfolioId };
  })
  .handler(async ({ data, context }) => {
    const { data: portfolio, error: portfolioError } = await context.supabase
      .from("business_portfolios")
      .select("id, organization_id")
      .eq("id", data.portfolioId)
      .maybeSingle();

    if (portfolioError || !portfolio) {
      throw new Error("Business Portfolio not found or not accessible");
    }

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_has_org_permission",
      {
        p_org_id: portfolio.organization_id,
        p_permission: "wabas.manage",
      },
    );
    if (permissionError || !allowed) throw new Error("Forbidden");

    const { syncPortfolioComplete } = await import("./portfolio-sync.server");
    return syncPortfolioComplete(data.portfolioId);
  });
