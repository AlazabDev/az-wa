import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireNumberDispatch, requireNumberManage, requireNumberSend, requireOrgPermission, requireWabaManage } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { errorResponse, HttpError, json, methodNotAllowed, parseJson, requestId } from "../_shared/http.ts";
import { metaFetch } from "../_shared/meta.ts";
import { requireUser, serviceClient, userClient } from "../_shared/supabase.ts";
import { syncNumberHealth } from "../_shared/sync.ts";
import { drainQueues } from "../_shared/worker.ts";

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const user = await requireUser(req);
    const udb = userClient(req);
    const svc = serviceClient();
    const path = routePath(req.url);
    const rid = requestId(req);
    let response: Response;

    if (req.method === "GET" && path === "/bootstrap") response = await bootstrap(udb);
    else if (req.method === "POST" && path === "/messages/send") response = await sendMessage(req, udb, svc, user.id);
    else if (req.method === "PATCH" && path === "/contacts") response = await patchContact(req, udb, svc);
    else if (req.method === "PATCH" && path === "/conversations") response = await patchConversation(req, udb, svc, user.id);
    else if (req.method === "POST" && path === "/conversations/notes") response = await addNote(req, udb, svc, user.id);
    else if (req.method === "POST" && path === "/meta/sync") response = await queueSync(req, udb, svc, user.id);
    else if (req.method === "POST" && path === "/numbers/test") response = await testNumber(req, udb, svc);
    else if (req.method === "PATCH" && path === "/numbers") response = await patchNumber(req, udb, svc);
    else if (req.method === "POST" && path === "/webhooks/subscribe-waba") response = await setWabaSubscription(req, udb, svc, rid, true);
    else if (req.method === "DELETE" && path === "/webhooks/subscribe-waba") response = await setWabaSubscription(req, udb, svc, rid, false);
    else if (req.method === "POST" && path === "/credentials") response = await storeCredential(req, udb, svc);
    else if (req.method === "POST" && path === "/media/signed-url") response = await mediaSignedUrl(req, udb, svc);
    else if (req.method === "POST" && path === "/campaigns/start") response = await startCampaign(req, udb, svc, user.id);
    else if (req.method === "POST" && path === "/worker/drain") response = await manualDrain(req, udb, svc);
    else if (["GET", "POST", "PATCH", "DELETE"].includes(req.method)) throw new HttpError(404, "Route not found", "not_found");
    else response = methodNotAllowed(["GET", "POST", "PATCH", "DELETE", "OPTIONS"]);

    return withHeaders(response, cors, rid);
  } catch (error) {
    return withHeaders(errorResponse(error), cors);
  }
});

async function bootstrap(db: any): Promise<Response> {
  const queries = await Promise.all([
    db.from("organizations").select("id,slug,name,status"),
    db.from("business_portfolios").select("id,organization_id,meta_business_id,name,status,is_primary,last_synced_at"),
    db.from("meta_apps").select("id,organization_id,business_portfolio_id,meta_app_id,display_name,namespace,status"),
    db.from("wabas").select("id,organization_id,business_portfolio_id,meta_waba_id,name,status,last_synced_at"),
    db.from("whatsapp_numbers").select("id,organization_id,waba_id,meta_phone_number_id,display_phone_number,verified_name,internal_name,department,country,purpose,quality_rating,messaging_limit,status,is_enabled,webhook_status,last_incoming_message_at,last_outgoing_message_at,last_api_success_at,last_api_failure_at,last_synced_at"),
  ]);
  for (const result of queries) if (result.error) throw new HttpError(500, result.error.message, "database_error");
  return json({ organizations: queries[0].data, business_portfolios: queries[1].data, meta_apps: queries[2].data, wabas: queries[3].data, whatsapp_numbers: queries[4].data });
}

async function sendMessage(req: Request, udb: any, svc: any, userId: string): Promise<Response> {
  const body = await parseJson<any>(req);
  const numberId = uuid(body.whatsapp_number_id, "whatsapp_number_id");
  await requireNumberSend(udb, numberId);
  const type = String(body.type ?? "text");
  if (!["text", "image", "video", "audio", "document", "sticker", "location", "contacts", "interactive", "template", "reaction"].includes(type)) throw new HttpError(400, `Unsupported message type: ${type}`);
  const idempotency = String(body.idempotency_key ?? "").trim();
  if (!idempotency) throw new HttpError(400, "idempotency_key is required");
  const payload = body.payload && typeof body.payload === "object" ? body.payload : buildPayload(type, body);
  const { data, error } = await svc.rpc("backend_create_outbox", {
    p_whatsapp_number_id: numberId,
    p_recipient_address: phone(body.to),
    p_message_type: type,
    p_request_payload: payload,
    p_idempotency_key: idempotency,
    p_requested_by: userId,
    p_contact_id: optionalUuid(body.contact_id),
    p_conversation_id: optionalUuid(body.conversation_id),
    p_campaign_id: null,
    p_campaign_recipient_id: null,
  });
  if (error) throw new HttpError(400, error.message, "send_queue_failed");
  waitUntil(drainQueues(svc, { queues: ["message-send", "outgoing-webhooks"], maxBatches: 3, maxRuntimeMs: 20_000 }));
  return json(data, 202);
}

async function patchContact(req: Request, udb: any, svc: any): Promise<Response> {
  const body = await parseJson<any>(req);
  const id = uuid(body.id ?? body.contact_id, "contact_id");
  const { data: visible } = await udb.from("contacts").select("id,organization_id").eq("id", id).maybeSingle();
  if (!visible) throw new HttpError(404, "Contact not found or inaccessible", "not_found");
  await requireOrgPermission(udb, visible.organization_id, "contacts.manage");
  const patch = pick(body, ["display_name", "first_name", "last_name", "email", "company", "status", "assigned_user_id", "assigned_team_id", "notes", "custom_fields"]);
  if (!Object.keys(patch).length) throw new HttpError(400, "No editable fields supplied");
  const { data, error } = await svc.from("contacts").update(patch).eq("id", id).select("*").single();
  if (error) throw new HttpError(400, error.message, "contact_update_failed");
  return json(data);
}

async function patchConversation(req: Request, udb: any, svc: any, userId: string): Promise<Response> {
  const body = await parseJson<any>(req);
  const id = uuid(body.id ?? body.conversation_id, "conversation_id");
  const { data: visible } = await udb.from("conversations").select("id,organization_id,assigned_user_id,assigned_team_id").eq("id", id).maybeSingle();
  if (!visible) throw new HttpError(404, "Conversation not found or inaccessible", "not_found");
  await requireOrgPermission(udb, visible.organization_id, "contacts.manage");
  const patch = pick(body, ["status", "priority", "assigned_user_id", "assigned_team_id"]);
  if (body.mark_read === true) patch.unread_count = 0;
  if (patch.status && !["open", "pending", "waiting_customer", "resolved", "closed", "spam"].includes(String(patch.status))) throw new HttpError(400, "Invalid conversation status");
  if (patch.priority && !["low", "normal", "high", "urgent"].includes(String(patch.priority))) throw new HttpError(400, "Invalid conversation priority");
  if (patch.status === "resolved") patch.resolved_at = new Date().toISOString();
  if (patch.status === "closed") patch.closed_at = new Date().toISOString();
  const assigning = Object.hasOwn(patch, "assigned_user_id") || Object.hasOwn(patch, "assigned_team_id");
  const { data, error } = await svc.from("conversations").update(patch).eq("id", id).select("*").single();
  if (error) throw new HttpError(400, error.message, "conversation_update_failed");
  if (assigning) await svc.from("conversation_assignments").insert({ organization_id: visible.organization_id, conversation_id: id, assigned_user_id: patch.assigned_user_id ?? null, assigned_team_id: patch.assigned_team_id ?? null, assigned_by: userId, reason: "manual" });
  return json(data);
}

async function addNote(req: Request, udb: any, svc: any, userId: string): Promise<Response> {
  const body = await parseJson<any>(req);
  const conversationId = uuid(body.conversation_id, "conversation_id");
  const note = String(body.body ?? "").trim();
  if (!note) throw new HttpError(400, "body is required");
  const { data: visible } = await udb.from("conversations").select("organization_id").eq("id", conversationId).maybeSingle();
  if (!visible) throw new HttpError(404, "Conversation not found or inaccessible", "not_found");
  const { data, error } = await svc.from("conversation_notes").insert({ organization_id: visible.organization_id, conversation_id: conversationId, author_user_id: userId, body: note, is_pinned: Boolean(body.is_pinned) }).select("*").single();
  if (error) throw new HttpError(400, error.message, "note_create_failed");
  return json(data, 201);
}

async function queueSync(req: Request, udb: any, svc: any, userId: string): Promise<Response> {
  const body = await parseJson<any>(req);
  const organizationId = uuid(body.organization_id, "organization_id");
  const syncType = String(body.sync_type ?? "full");
  if (!["business", "wabas", "numbers", "templates", "number_health", "full"].includes(syncType)) throw new HttpError(400, "Invalid sync_type");
  await requireOrgPermission(udb, organizationId, syncType === "number_health" ? "health.read" : syncType === "templates" ? "templates.manage" : "business.manage");
  const { data, error } = await svc.from("jobs").insert({
    organization_id: organizationId,
    queue_name: "meta-sync",
    job_type: "meta_sync",
    deduplication_key: `meta-sync:${syncType}:${crypto.randomUUID()}`,
    priority: 30,
    payload: { organization_id: organizationId, requested_by: userId, sync_type: syncType, business_portfolio_id: optionalUuid(body.business_portfolio_id), waba_id: optionalUuid(body.waba_id), whatsapp_number_id: optionalUuid(body.whatsapp_number_id) },
    status: "queued",
    max_attempts: 4,
  }).select("id").single();
  if (error) throw new HttpError(500, error.message, "sync_queue_failed");
  waitUntil(drainQueues(svc, { queues: ["meta-sync"], maxBatches: 1, maxRuntimeMs: 25_000 }));
  return json({ status: "queued", job_id: data.id }, 202);
}

async function testNumber(req: Request, udb: any, svc: any): Promise<Response> {
  const body = await parseJson<any>(req);
  const organizationId = uuid(body.organization_id, "organization_id");
  const numberId = uuid(body.whatsapp_number_id, "whatsapp_number_id");
  await requireOrgPermission(udb, organizationId, "health.read");
  const { data: visible } = await udb.from("whatsapp_numbers").select("id").eq("id", numberId).maybeSingle();
  if (!visible) throw new HttpError(403, "No access to this WhatsApp number", "forbidden");
  return json(await syncNumberHealth(svc, organizationId, numberId));
}

async function patchNumber(req: Request, udb: any, svc: any): Promise<Response> {
  const body = await parseJson<any>(req);
  const id = uuid(body.id ?? body.whatsapp_number_id, "whatsapp_number_id");
  await requireNumberManage(udb, id, "numbers.manage");
  const patch = pick(body, ["internal_name", "department", "country", "purpose", "tags", "is_enabled", "is_default", "timezone", "default_language"]);
  if (!Object.keys(patch).length) throw new HttpError(400, "No editable fields supplied");
  const { data, error } = await svc.from("whatsapp_numbers").update(patch).eq("id", id).select("*").single();
  if (error) throw new HttpError(400, error.message, "number_update_failed");
  return json(data);
}

async function setWabaSubscription(req: Request, udb: any, svc: any, correlationId: string, subscribe: boolean): Promise<Response> {
  const body = await parseJson<any>(req);
  const wabaId = uuid(body.waba_id, "waba_id");
  await requireWabaManage(udb, wabaId, "webhooks.manage");
  const { data: waba } = await svc.from("wabas").select("*").eq("id", wabaId).maybeSingle();
  if (!waba) throw new HttpError(404, "WABA not found");
  const meta = await metaFetch(svc, { organizationId: waba.organization_id, wabaId, businessPortfolioId: waba.business_portfolio_id }, `${waba.meta_waba_id}/subscribed_apps`, { method: subscribe ? "POST" : "DELETE", correlationId, ...(subscribe ? { body: {} } : {}) });
  await svc.from("meta_app_wabas").update({ status: subscribe ? "active" : "inactive" }).eq("waba_id", wabaId);
  return json({ subscribed: subscribe, meta });
}

async function storeCredential(req: Request, udb: any, svc: any): Promise<Response> {
  const body = await parseJson<any>(req);
  const organizationId = uuid(body.organization_id, "organization_id");
  await requireOrgPermission(udb, organizationId, "credentials.manage");
  const credentialType = String(body.credential_type ?? "");
  if (!["system_user_token", "user_token", "app_secret", "verify_token", "access_token", "other"].includes(credentialType)) throw new HttpError(400, "Invalid credential_type");
  const secret = String(body.secret ?? "");
  if (!secret) throw new HttpError(400, "secret is required");
  const scope = { meta_app_id: optionalUuid(body.meta_app_id), business_portfolio_id: optionalUuid(body.business_portfolio_id), waba_id: optionalUuid(body.waba_id), whatsapp_number_id: optionalUuid(body.whatsapp_number_id) };
  await assertScopeOwnership(svc, organizationId, scope);
  const { data, error } = await svc.rpc("backend_store_meta_credential", { p_organization_id: organizationId, p_credential_type: credentialType, p_name: String(body.name ?? credentialType), p_secret: secret, p_meta_app_id: scope.meta_app_id, p_business_portfolio_id: scope.business_portfolio_id, p_waba_id: scope.waba_id, p_whatsapp_number_id: scope.whatsapp_number_id, p_scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : [], p_expires_at: body.expires_at ?? null });
  if (error) throw new HttpError(500, error.message, "credential_store_failed");
  return json({ credential_id: data, stored: true }, 201);
}

async function mediaSignedUrl(req: Request, udb: any, svc: any): Promise<Response> {
  const body = await parseJson<any>(req);
  const id = uuid(body.media_id, "media_id");
  const expires = Math.max(60, Math.min(Number(body.expires_in ?? 900), 3600));
  const { data: media } = await udb.from("media").select("id,storage_bucket,storage_path,download_status,filename,mime_type").eq("id", id).maybeSingle();
  if (!media) throw new HttpError(404, "Media not found or inaccessible", "not_found");
  if (media.download_status !== "stored" || !media.storage_path) throw new HttpError(409, "Media is not stored yet", "media_not_ready");
  const { data, error } = await svc.storage.from(media.storage_bucket).createSignedUrl(media.storage_path, expires);
  if (error || !data?.signedUrl) throw new HttpError(500, error?.message ?? "Unable to create signed URL", "storage_error");
  return json({ media_id: id, filename: media.filename, mime_type: media.mime_type, signed_url: data.signedUrl, expires_in: expires });
}

async function startCampaign(req: Request, udb: any, svc: any, userId: string): Promise<Response> {
  const body = await parseJson<any>(req);
  const campaignId = uuid(body.campaign_id, "campaign_id");
  const { data: campaign } = await svc.from("campaigns").select("id,organization_id,sender_whatsapp_number_id").eq("id", campaignId).maybeSingle();
  if (!campaign) throw new HttpError(404, "Campaign not found");
  await requireOrgPermission(udb, campaign.organization_id, "campaigns.send");
  await requireNumberDispatch(udb, campaign.sender_whatsapp_number_id, "campaigns.send");
  const { data, error } = await svc.rpc("backend_enqueue_campaign", { p_campaign_id: campaignId, p_requested_by: userId });
  if (error) throw new HttpError(400, error.message, "campaign_start_failed");
  waitUntil(drainQueues(svc, { queues: ["message-send", "outgoing-webhooks"], maxBatches: 5, maxRuntimeMs: 25_000 }));
  return json(data, 202);
}

async function manualDrain(req: Request, udb: any, svc: any): Promise<Response> {
  const body = await parseJson<any>(req);
  const organizationId = uuid(body.organization_id, "organization_id");
  await requireOrgPermission(udb, organizationId, "settings.manage");
  const queues = Array.isArray(body.queues) ? body.queues.map(String) : undefined;
  return json(await drainQueues(svc, { queues, batchSize: Math.max(1, Math.min(Number(body.batch_size ?? 20), 100)), maxBatches: Math.max(1, Math.min(Number(body.max_batches ?? 5), 20)), maxRuntimeMs: 30_000 }));
}

function buildPayload(type: string, body: any): Record<string, unknown> {
  const base: Record<string, unknown> = { messaging_product: "whatsapp", type };
  if (type === "text") base.text = { body: String(body.text ?? body.body ?? "") };
  else if (body[type] !== undefined) base[type] = body[type];
  else throw new HttpError(400, `Missing ${type} payload`);
  return base;
}

async function assertScopeOwnership(svc: any, orgId: string, scope: Record<string, string | null>): Promise<void> {
  const checks: Array<[string, string | null]> = [["meta_apps", scope.meta_app_id], ["business_portfolios", scope.business_portfolio_id], ["wabas", scope.waba_id], ["whatsapp_numbers", scope.whatsapp_number_id]];
  for (const [table, id] of checks) {
    if (!id) continue;
    const { data } = await svc.from(table).select("id").eq("id", id).eq("organization_id", orgId).maybeSingle();
    if (!data) throw new HttpError(400, `${table} scope does not belong to organization`);
  }
}

function routePath(url: string): string {
  const path = new URL(url).pathname;
  const marker = "/azwa-api";
  const index = path.indexOf(marker);
  return index >= 0 ? path.slice(index + marker.length) || "/" : path;
}

function withHeaders(response: Response, headers: Record<string, string>, rid?: string): Response {
  const out = new Headers(response.headers);
  for (const [key, value] of Object.entries(headers)) out.set(key, value);
  if (rid) out.set("x-request-id", rid);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: out });
}

function uuid(value: unknown, name: string): string {
  const result = String(value ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new HttpError(400, `${name} must be a UUID`);
  return result;
}

function optionalUuid(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return uuid(value, "id");
}

function phone(value: unknown): string {
  const result = String(value ?? "").replace(/[^0-9]/g, "");
  if (result.length < 8 || result.length > 15) throw new HttpError(400, "Invalid recipient phone number");
  return result;
}

function pick(source: Record<string, unknown>, allowed: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of allowed) if (Object.hasOwn(source, key)) out[key] = source[key];
  return out;
}

function waitUntil(promise: Promise<unknown>): void {
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(promise);
  else void promise;
}
