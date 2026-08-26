import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncBusinessPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { portfolioId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Forbidden");
    const { syncPortfolio } = await import("./operations.server");
    return syncPortfolio(data.portfolioId);
  });

export const testWhatsappNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { numberId: string }) => input)
  .handler(async ({ data }) => {
    const { runNumberDiagnostics } = await import("./operations.server");
    return { numberId: data.numberId, results: await runNumberDiagnostics(data.numberId) };
  });
