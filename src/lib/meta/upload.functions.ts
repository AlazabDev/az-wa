import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UploadHeaderMediaInput = {
  wabaId: string;
  fileName: string;
  mimeType: string;
  /** Base64-encoded file content (no data-URL prefix). */
  contentBase64: string;
  headerFormat: "IMAGE" | "VIDEO" | "DOCUMENT";
};

const MAX_BASE64_LENGTH = 140 * 1024 * 1024;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Uploads a template header asset to Meta and returns the `header_handle`
 * needed by IMAGE / VIDEO / DOCUMENT header components at creation time.
 */
export const uploadTemplateHeaderMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UploadHeaderMediaInput) => {
    if (!input?.wabaId) throw new Error("A WABA is required");
    if (!input.fileName?.trim()) throw new Error("A file name is required");
    if (!input.mimeType?.trim()) throw new Error("A file MIME type is required");
    if (!input.contentBase64) throw new Error("File content is required");
    if (input.contentBase64.length > MAX_BASE64_LENGTH) {
      throw new Error("The uploaded file exceeds the 100 MB Meta limit");
    }
    const headerFormat = String(input.headerFormat ?? "IMAGE").toUpperCase();
    if (!["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat)) {
      throw new Error("Unsupported media header format");
    }
    return {
      wabaId: input.wabaId,
      fileName: input.fileName.trim(),
      mimeType: input.mimeType.trim().toLowerCase(),
      contentBase64: input.contentBase64,
      headerFormat: headerFormat as "IMAGE" | "VIDEO" | "DOCUMENT",
    };
  })
  .handler(async ({ data, context }) => {
    const { data: waba, error: wabaError } = await context.supabase
      .from("wabas")
      .select("id, organization_id")
      .eq("id", data.wabaId)
      .maybeSingle();
    if (wabaError || !waba) throw new Error("WABA not found or not accessible");

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_has_org_permission",
      { p_org_id: waba.organization_id, p_permission: "templates.manage" },
    );
    if (permissionError || !allowed) throw new Error("Forbidden");

    const { ALLOWED_HEADER_MEDIA_TYPES, uploadHeaderMedia } = await import("./upload.server");
    const allowedTypes = ALLOWED_HEADER_MEDIA_TYPES[data.headerFormat] ?? [];
    if (!allowedTypes.includes(data.mimeType)) {
      throw new Error(
        `${data.headerFormat} headers accept only: ${allowedTypes.join(", ")}`,
      );
    }

    const result = await uploadHeaderMedia({
      wabaId: data.wabaId,
      fileName: data.fileName,
      mimeType: data.mimeType,
      bytes: decodeBase64(data.contentBase64),
    });

    if (!result.ok) throw new Error(result.error);

    return {
      ok: true as const,
      headerHandle: result.headerHandle,
      fileLength: result.fileLength,
      // Ready-to-use example payload for the HEADER component.
      example: { header_handle: [result.headerHandle] },
    };
  });
