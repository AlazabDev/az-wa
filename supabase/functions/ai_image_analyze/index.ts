import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders, createErrorResponse, createSuccessResponse } from "./utils.ts";
import { GeminiClient } from "./gemini.client.ts";
import { ImageAnalysisCache } from "./cache.service.ts";
import { AnalysisResult, MaintenanceIssueType, UrgencyLevel } from "./types.ts";
import {
  getAuthenticatedUser,
  getOrganizationIdBySlug,
  hasOrganizationPermission,
} from "../_shared/access-control.ts";
import { assertPublicWebhookUrl } from "../_shared/ssrf.ts";

// تهيئة Supabase Client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// تهيئة Gemini Client
const geminiClient = new GeminiClient(Deno.env.get("GEMINI_API_KEY")!);
const cacheService = new ImageAnalysisCache(supabase);

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return createErrorResponse("Method not allowed", 405);

  const user = await getAuthenticatedUser(req);
  if (!user) return createErrorResponse("Unauthorized", 401);

  try {
    const input = await req.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return createErrorResponse("Invalid request body", 400);
    }
    const { image_url, image_base64, image_buffer, caption, conversation_id, request_id } =
      input as Record<string, unknown>;

    let organizationId: string | null = null;
    let requiredPermission = "media.read";
    if (conversation_id !== undefined && conversation_id !== null) {
      if (typeof conversation_id !== "string" || !conversation_id) {
        return createErrorResponse("Invalid conversation_id", 400);
      }
      const { data: conversation, error: conversationError } = await user.supabase
        .from("conversations")
        .select("id, organization_id")
        .eq("id", conversation_id)
        .maybeSingle();
      if (conversationError || !conversation) return createErrorResponse("Conversation not found", 404);
      organizationId = String(conversation.organization_id);
      requiredPermission = "messages.read";
    } else {
      organizationId = await getOrganizationIdBySlug("alazab-group");
    }

    if (
      !organizationId ||
      !(await hasOrganizationPermission(user, organizationId, requiredPermission))
    ) {
      return createErrorResponse("Forbidden", 403);
    }

    // التحقق من وجود صورة
    if (!image_url && !image_base64 && !image_buffer) {
      return createErrorResponse(
        "No image provided. Please provide image_url, image_base64, or image_buffer",
        400,
      );
    }

    // 1. حساب hash للصورة للتخزين المؤقت
    let imageData: string | Uint8Array;
    if (image_url) {
      if (typeof image_url !== "string") return createErrorResponse("Invalid image_url", 400);
      const destination = await assertPublicWebhookUrl(image_url);
      if (!destination.ok) {
        return createErrorResponse("Image URL must be a public HTTPS address", 400);
      }
      const response = await fetch(image_url, { redirect: "error" });
      if (!response.ok) return createErrorResponse("Unable to retrieve image", 400);
      imageData = new Uint8Array(await response.arrayBuffer());
    } else if (image_base64) {
      if (typeof image_base64 !== "string") return createErrorResponse("Invalid image_base64", 400);
      imageData = image_base64;
    } else {
      if (typeof image_buffer !== "string") return createErrorResponse("Invalid image_buffer", 400);
      imageData = new Uint8Array(JSON.parse(image_buffer));
    }

    const imageHash = await calculateImageHash(imageData);

    // 2. البحث في cache
    const cachedAnalysis = await cacheService.get(imageHash);
    if (cachedAnalysis) {
      console.log("✅ Analysis found in cache for hash:", imageHash);

      // تسجيل التحليل مع المحادثة إذا كان هناك conversation_id
      if (conversation_id) {
        await saveAnalysisToConversation(
          conversation_id as string,
          organizationId,
          cachedAnalysis,
          typeof request_id === "string" ? request_id : undefined,
        );
      }

      return createSuccessResponse({
        from_cache: true,
        analysis: cachedAnalysis,
        image_hash: imageHash,
      });
    }

    // 3. تحليل الصورة باستخدام Gemini
    console.log("🔄 Analyzing image with Gemini...");
    const analysis = await geminiClient.analyzeImage(
      imageData,
      typeof caption === "string" ? caption : undefined,
    );

    // 4. تخزين النتيجة في cache
    await cacheService.set(imageHash, analysis);

    // 5. حفظ التحليل في قاعدة البيانات
    if (conversation_id) {
      await saveAnalysisToConversation(
        conversation_id as string,
        organizationId,
        analysis,
        typeof request_id === "string" ? request_id : undefined,
      );
    }

    // 6. إرجاع النتيجة
    return createSuccessResponse({
      from_cache: false,
      analysis,
      image_hash: imageHash,
    });
  } catch (error) {
    console.error("❌ Error in ai_image_analyze:", error);
    return createErrorResponse(error.message || "Internal server error", 500);
  }
});

// حساب hash للصورة
async function calculateImageHash(data: string | Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  let bytes: Uint8Array;

  if (typeof data === "string") {
    bytes = encoder.encode(data);
  } else {
    bytes = data;
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// حفظ التحليل في قاعدة البيانات
async function saveAnalysisToConversation(
  conversationId: string,
  organizationId: string,
  analysis: AnalysisResult,
  requestId?: string,
) {
  // تحديث المحادثة بآخر تحليل
  const { error: convError } = await supabase
    .from("conversations")
    .update({
      last_ai_analysis: analysis,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("organization_id", organizationId);

  if (convError) {
    console.error("Error updating conversation:", convError);
  }

  // إذا كان هناك طلب صيانة، قم بتحديثه
  if (requestId) {
    const { error: reqError } = await supabase
      .from("maintenance_requests")
      .update({
        ai_analysis: analysis,
        issue_type: analysis.issue_type,
        urgency: analysis.urgency,
        description: analysis.description,
      })
      .eq("id", requestId);

    if (reqError) {
      console.error("Error updating maintenance request:", reqError);
    }
  }
}
