/**
 * Meta Resumable Upload API — server only.
 *
 * Used to obtain a `header_handle` for media template headers
 * (IMAGE / VIDEO / DOCUMENT). Two steps:
 *   1. POST /{app_id}/uploads?file_name&file_length&file_type -> { id: "upload:..." }
 *   2. POST /{upload_session_id} with `Authorization: OAuth <token>` and
 *      `file_offset: 0` plus the raw binary body -> { h: "<header_handle>" }
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { GRAPH_BASE, resolveCredential } from "./graph.server";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const ALLOWED_HEADER_MEDIA_TYPES: Record<string, string[]> = {
  IMAGE: ["image/jpeg", "image/png"],
  VIDEO: ["video/mp4", "video/3gpp"],
  DOCUMENT: ["application/pdf"],
};

export type UploadResult =
  | { ok: true; headerHandle: string; uploadSessionId: string; fileLength: number }
  | { ok: false; error: string };

type UploadScope = {
  organizationId: string;
  wabaId: string;
  businessPortfolioId: string | null;
};

async function loadUploadScope(wabaId: string): Promise<UploadScope | null> {
  const { data } = await supabaseAdmin
    .from("wabas")
    .select("id, organization_id, business_portfolio_id")
    .eq("id", wabaId)
    .maybeSingle();
  if (!data) return null;
  return {
    organizationId: data.organization_id,
    wabaId: data.id,
    businessPortfolioId: data.business_portfolio_id ?? null,
  };
}

/** Resolve the Meta app id that owns the upload session for this WABA scope. */
async function resolveMetaAppId(scope: UploadScope): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("meta_apps")
    .select("meta_app_id, business_portfolio_id, status")
    .eq("organization_id", scope.organizationId)
    .eq("status", "active")
    .order("created_at");

  const rows = data ?? [];
  const scoped = rows.find((row) => row.business_portfolio_id === scope.businessPortfolioId);
  const chosen = scoped ?? rows[0];
  return chosen?.meta_app_id ?? process.env["META_APP_ID"] ?? null;
}

async function logUpload(
  scope: UploadScope,
  endpoint: string,
  status: number,
  durationMs: number,
  errorMessage?: string,
) {
  await supabaseAdmin.from("api_requests").insert({
    organization_id: scope.organizationId,
    endpoint,
    method: "POST",
    http_status: status,
    duration_ms: durationMs,
    waba_id: scope.wabaId,
    business_portfolio_id: scope.businessPortfolioId,
    meta_error_message: errorMessage ?? null,
  });
}

/**
 * Uploads a binary file through the resumable upload API and returns the
 * `header_handle` that a media template header requires at creation time.
 */
export async function uploadHeaderMedia(input: {
  wabaId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<UploadResult> {
  if (input.bytes.byteLength === 0) return { ok: false, error: "The uploaded file is empty" };
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "The uploaded file exceeds the 100 MB Meta limit" };
  }

  const scope = await loadUploadScope(input.wabaId);
  if (!scope) return { ok: false, error: "WABA not found" };

  const credential = await resolveCredential({
    wabaId: scope.wabaId,
    businessPortfolioId: scope.businessPortfolioId,
  });
  if (!credential.token) {
    return { ok: false, error: "No Meta credential resolved for this WABA" };
  }

  const appId = await resolveMetaAppId(scope);
  if (!appId) {
    return { ok: false, error: "No active Meta app is configured for this organization" };
  }

  const sessionUrl = new URL(`${GRAPH_BASE}/${appId}/uploads`);
  sessionUrl.searchParams.set("file_name", input.fileName);
  sessionUrl.searchParams.set("file_length", String(input.bytes.byteLength));
  sessionUrl.searchParams.set("file_type", input.mimeType);

  let started = Date.now();
  const sessionResponse = await fetch(sessionUrl.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${credential.token}` },
  });
  const sessionPayload = (await sessionResponse.json().catch(() => null)) as
    | { id?: string; error?: { message?: string } }
    | null;

  await logUpload(
    scope,
    `${appId}/uploads`,
    sessionResponse.status,
    Date.now() - started,
    sessionPayload?.error?.message,
  );

  if (!sessionResponse.ok || !sessionPayload?.id) {
    return {
      ok: false,
      error: sessionPayload?.error?.message ?? `Upload session failed with HTTP ${sessionResponse.status}`,
    };
  }

  const uploadSessionId = sessionPayload.id;

  started = Date.now();
  const uploadResponse = await fetch(`${GRAPH_BASE}/${uploadSessionId}`, {
    method: "POST",
    headers: {
      // The transfer step authenticates with the OAuth scheme, not Bearer.
      Authorization: `OAuth ${credential.token}`,
      file_offset: "0",
      "Content-Type": "application/octet-stream",
    },
    body: input.bytes as unknown as BodyInit,
  });
  const uploadPayload = (await uploadResponse.json().catch(() => null)) as
    | { h?: string; error?: { message?: string } }
    | null;

  await logUpload(
    scope,
    uploadSessionId,
    uploadResponse.status,
    Date.now() - started,
    uploadPayload?.error?.message,
  );

  if (!uploadResponse.ok || !uploadPayload?.h) {
    return {
      ok: false,
      error: uploadPayload?.error?.message ?? `Media transfer failed with HTTP ${uploadResponse.status}`,
    };
  }

  return {
    ok: true,
    headerHandle: uploadPayload.h,
    uploadSessionId,
    fileLength: input.bytes.byteLength,
  };
}
