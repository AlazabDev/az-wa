import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InboundDiagnosticStep = {
  name: string;
  status: "success" | "failed" | "skipped";
  details?: string;
  durationMs?: number;
};

export type NumberDiagnosticResult = {
  numberId: string;
  displayPhoneNumber: string;
  metaPhoneNumberId: string;
  ok: boolean;
  steps: InboundDiagnosticStep[];
  messageId?: string;
  conversationId?: string;
  mediaId?: string;
  publicUrl?: string;
  error?: string;
};

export type DiagnosticSummary = {
  ok: boolean;
  testedAt: string;
  results: NumberDiagnosticResult[];
};

// صورة اختبارية مصغرة PNG صالحة (1x1 Transparent PNG)
const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export const runInboundDiagnostic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { numberId?: string | null; cleanup?: boolean }) => {
    return {
      numberId: input.numberId || null,
      cleanup: Boolean(input.cleanup),
    };
  })
  .handler(async ({ data, context }): Promise<DiagnosticSummary> => {
    // 1. التحقق من صلاحية المستخدم
    const { data: membership } = await context.supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!membership) {
      throw new Error("No active organization membership found.");
    }
    const orgId = membership.organization_id;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveCredential } = await import("@/lib/meta/graph.server");
    const { putLocalObject, newPublicToken, publicFileUrl, LOCAL_PROVIDER } =
      await import("@/lib/storage/local.server");

    // 2. جلب الأرقام المستهدفة
    let query = supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, display_phone_number, meta_phone_number_id, organization_id, status")
      .eq("organization_id", orgId);

    if (data.numberId) {
      query = query.eq("id", data.numberId);
    }

    const { data: numbers, error: numbersError } = await query;
    if (numbersError) {
      throw new Error(`Failed to load numbers: ${numbersError.message}`);
    }

    const results: NumberDiagnosticResult[] = [];

    for (const num of numbers ?? []) {
      const steps: InboundDiagnosticStep[] = [];
      let allOk = true;
      let createdMessageId: string | undefined;
      let createdConversationId: string | undefined;
      let createdMediaId: string | undefined;
      let generatedPublicUrl: string | undefined;

      // ── الخطوة 1: فحص اعتماد وتوكن Meta ──
      const t0 = Date.now();
      try {
        const cred = await resolveCredential({ whatsappNumberId: num.id });
        if (!cred.token) {
          throw new Error("No active Meta credential resolved for this number");
        }
        steps.push({
          name: "Meta Credential Resolution",
          status: "success",
          details: `Resolved via ${cred.source}`,
          durationMs: Date.now() - t0,
        });
      } catch (err: any) {
        allOk = false;
        steps.push({
          name: "Meta Credential Resolution",
          status: "failed",
          details: err?.message || "Token resolution error",
          durationMs: Date.now() - t0,
        });
      }

      // ── الخطوة 2: محاكاة واستلام رسالة وصورة واردة في الـ Inbox ──
      const t1 = Date.now();
      const testTimestamp = Math.floor(Date.now() / 1000);
      const testMetaMessageId = `wamid.DIAG_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const testMetaMediaId = `meta_diag_img_${Date.now()}`;
      const simulatedWaId = "201000000099";

      try {
        const simulatedPayload = {
          id: testMetaMessageId,
          from: simulatedWaId,
          timestamp: String(testTimestamp),
          type: "image",
          image: {
            id: testMetaMediaId,
            mime_type: "image/png",
            caption: `[AzWA Diagnostic Test] اختبار استلام الرسائل والصور — ${new Date().toLocaleTimeString()}`,
          },
        };

        const { data: ingestResult, error: ingestError } = await (supabaseAdmin as any).rpc(
          "backend_ingest_inbound_message",
          {
            p_organization_id: orgId,
            p_meta_phone_number_id: num.meta_phone_number_id,
            p_contact_wa_id: simulatedWaId,
            p_contact_profile_name: "AzWA Diagnostic Bot",
            p_message: simulatedPayload,
          },
        );

        if (ingestError) {
          throw new Error(ingestError.message);
        }

        const res = ingestResult as Record<string, any>;
        if (res?.status === "unmapped_number") {
          throw new Error(`Phone number ${num.meta_phone_number_id} is not mapped in database`);
        }

        createdMessageId = res?.message_id;
        createdConversationId = res?.conversation_id;
        createdMediaId = res?.media_id;

        steps.push({
          name: "Inbound Webhook & Inbox Pipeline",
          status: "success",
          details: `Message created: ${createdMessageId ?? "OK"} in conversation ${createdConversationId ?? "OK"}`,
          durationMs: Date.now() - t1,
        });
      } catch (err: any) {
        allOk = false;
        steps.push({
          name: "Inbound Webhook & Inbox Pipeline",
          status: "failed",
          details: err?.message || "Inbound ingest error",
          durationMs: Date.now() - t1,
        });
      }

      // ── الخطوة 3: التحقق من سجل الوسائط (Media Table) ──
      const t2 = Date.now();
      let mediaRow: any = null;
      try {
        if (!createdMediaId && createdMessageId) {
          const { data: foundMedia } = await supabaseAdmin
            .from("media")
            .select("id, storage_path, download_status, metadata")
            .eq("message_id", createdMessageId)
            .maybeSingle();
          if (foundMedia) {
            createdMediaId = foundMedia.id;
            mediaRow = foundMedia;
          }
        } else if (createdMediaId) {
          const { data: foundMedia } = await supabaseAdmin
            .from("media")
            .select("id, storage_path, download_status, metadata")
            .eq("id", createdMediaId)
            .maybeSingle();
          mediaRow = foundMedia;
        }

        if (!createdMediaId) {
          throw new Error("No media record was registered in the media table");
        }

        steps.push({
          name: "Media Record Creation",
          status: "success",
          details: `Media row verified (ID: ${createdMediaId})`,
          durationMs: Date.now() - t2,
        });
      } catch (err: any) {
        allOk = false;
        steps.push({
          name: "Media Record Creation",
          status: "failed",
          details: err?.message || "Media registry check failed",
          durationMs: Date.now() - t2,
        });
      }

      // ── الخطوة 4: مسار حفظ الصورة بالتخزين المحلي وتوليد الرابط العام ──
      const t3 = Date.now();
      try {
        if (!createdMediaId) {
          throw new Error("Skipped because media record is missing");
        }

        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth() + 1;
        const storageKey = `${year}/${month}/img/diag-${createdMediaId}.png`;
        const imageBuffer = Buffer.from(TEST_PNG_BASE64, "base64");

        // حفظ الصورة فعلياً على القرص المحلي في storage/media
        const stored = await putLocalObject({
          key: storageKey,
          body: imageBuffer,
        });

        // توليد التوكن والرابط العام
        const publicToken = newPublicToken();
        generatedPublicUrl = publicFileUrl(publicToken);

        // تحديث سجل الوسائط
        const metaObj = {
          ...(typeof mediaRow?.metadata === "object" ? mediaRow.metadata : {}),
          public_token: publicToken,
          public_url: generatedPublicUrl,
          diagnostic_test: true,
        };

        const { error: updateError } = await supabaseAdmin
          .from("media")
          .update({
            storage_provider: LOCAL_PROVIDER,
            storage_path: stored.key,
            download_status: "downloaded",
            mime_type: "image/png",
            file_size: stored.size,
            metadata: metaObj,
            stored_at: new Date().toISOString(),
          })
          .eq("id", createdMediaId);

        if (updateError) {
          throw new Error(`Failed to update media status: ${updateError.message}`);
        }

        steps.push({
          name: "Local Storage & Public URL",
          status: "success",
          details: `Stored locally (${stored.size} bytes) -> Token generated`,
          durationMs: Date.now() - t3,
        });
      } catch (err: any) {
        allOk = false;
        steps.push({
          name: "Local Storage & Public URL",
          status: "failed",
          details: err?.message || "Storage write error",
          durationMs: Date.now() - t3,
        });
      }

      // ── تنظيف اختياري لسجلات الاختبار إذا طُلب ذلك ──
      if (data.cleanup && createdMessageId) {
        try {
          if (createdMediaId) {
            await supabaseAdmin.from("media").delete().eq("id", createdMediaId);
          }
          await supabaseAdmin.from("messages").delete().eq("id", createdMessageId);
        } catch (_) {
          // ignore cleanup errors
        }
      }

      results.push({
        numberId: num.id,
        displayPhoneNumber: num.display_phone_number || num.meta_phone_number_id,
        metaPhoneNumberId: num.meta_phone_number_id,
        ok: allOk,
        steps,
        messageId: createdMessageId,
        conversationId: createdConversationId,
        mediaId: createdMediaId,
        publicUrl: generatedPublicUrl,
        error: allOk ? undefined : "One or more diagnostic steps failed",
      });
    }

    return {
      ok: results.every((r) => r.ok),
      testedAt: new Date().toISOString(),
      results,
    };
  });
