import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('both legacy WhatsApp Edge receivers call the shared fail-closed verifier', () => {
  for (const p of ['supabase/functions/wa_webhook_inbound/index.ts', 'supabase/functions/whatsapp_webhook/index.ts']) {
    const source = read(p);
    assert.match(source, /import \{ verifyMetaSignature \} from ['"]\.\.\/_shared\/meta-signature\.mjs['"]/);
    assert.match(source, /await verifyMetaSignature\(/);
    assert.doesNotMatch(source, /signature verification skipped|skip if no secret configured|if \(!appSecret \|\| !signature\) return true/);
  }
});

test('verification challenge requires a configured nonempty token in both Edge receivers', () => {
  for (const p of ['supabase/functions/wa_webhook_inbound/index.ts', 'supabase/functions/whatsapp_webhook/index.ts']) {
    const source = read(p);
    assert.match(source, /if \(verifyToken && mode === 'subscribe'|if \(verifyToken && mode === "subscribe"|if \(!verifyToken\)/);
  }
});

test('status updates are constrained to tenants owning the receiving phone number', () => {
  const receiver = read('supabase/functions/whatsapp_webhook/index.ts');
  const inbound = read('supabase/functions/wa_webhook_inbound/index.ts');
  assert.match(receiver, /handleStatus\(supabase, status, tenantIds\)/);
  assert.match(receiver, /\.in\("tenant_id", tenantIds\)/);
  assert.match(inbound, /\.in\("tenant_id", waNumbers\.map\(/);
});

test('primary WhatsApp receiver fails closed on missing app secret', () => {
  const source = read('supabase/functions/wa-webhook/index.ts');
  assert.match(source, /if \(!APP_SECRET\) return new Response\([^\n]+503/);
  assert.match(source, /if \(!APP_SECRET \|\| !signature\?\.startsWith\("sha256="\)\) return false/);
});

test('CI invokes security tests and source secret scan', () => {
  const workflow = read('.github/workflows/quality-gate.yml');
  assert.match(workflow, /meta-signature\.test\.mjs/);
  assert.match(workflow, /security-contract\.test\.mjs/);
  assert.match(workflow, /node scripts\/security-scan\.mjs/);
});

test('deployment cannot apply historical migrations', () => {
  const deploy = read('deploy/deploy.sh');
  assert.match(deploy, /--apply-migrations\|--migrate\) echo "BLOCKED:/);
  assert.doesNotMatch(deploy, /supabase db push/);
});

test('privileged message, vision, media, and worker handlers require the internal service credential', () => {
  for (const path of [
    'supabase/functions/chatbot_engine/index.ts',
    'supabase/functions/ai_auto_reply/index.ts',
    'supabase/functions/ai_vision/index.ts',
    'supabase/functions/seafile_upload/index.ts',
    'supabase/functions/worker_dispatch/index.ts',
  ]) {
    const source = read(path);
    assert.match(source, /isTrustedServiceRequest\(req\)/, path);
    assert.match(source, /Unauthorized/, path);
  }
});

test('broadcast and arbitrary-number messaging require elevated tenant access', () => {
  const broadcast = read('supabase/functions/broadcast_send/index.ts');
  assert.match(broadcast, /getAuthenticatedUser\(req\)/);
  assert.match(broadcast, /hasTenantRole\(user\.userId, tenantId, \["admin"\]\)/);
  assert.match(broadcast, /sender\.phone_number_id !== phoneNumberId/);

  const sender = read('supabase/functions/wa-send/index.ts');
  assert.match(sender, /existingContact && member\.role !== "admin"/);
  assert.match(sender, /Only tenant administrators may send to a new recipient/);
});

test('selected image and webhook URL fetches reject private destinations and redirects', () => {
  const image = read('supabase/functions/ai_image_analyze/index.ts');
  assert.match(image, /getAuthenticatedUser\(req\)/);
  assert.match(image, /hasOrganizationPermission\(user, organizationId, requiredPermission\)/);
  assert.match(image, /assertPublicWebhookUrl\(image_url\)/);
  assert.match(image, /fetch\(image_url, \{ redirect: "error" \}\)/);
  assert.match(image, /\.eq\("organization_id", organizationId\)/);

  const upload = read('supabase/functions/seafile_upload/index.ts');
  assert.match(upload, /assertPublicWebhookUrl\(String\(file_url\)\)/);
  assert.match(upload, /fetch\(String\(file_url\), \{ redirect: "error" \}\)/);

  const webhookAdmin = read('supabase/functions/webhooks_manage/index.ts');
  assert.match(webhookAdmin, /assertPublicWebhookUrl\(ep\.url\)/);
  assert.match(webhookAdmin, /redirect: "error"/);
});

test('legacy WhatsApp webhook requires Meta signatures and scopes status updates to its account', () => {
  const webhook = read('supabase/functions/whatsapp-webhook/index.ts');
  assert.match(webhook, /verifyMetaSignature\(/);
  assert.match(webhook, /getMetaAppSecret\(\)/);
  assert.match(webhook, /\.eq\("account_id", account\.id\)/);
  assert.match(webhook, /\.eq\("wa_message_id", s\.id\)/);
});

test('Daftra writes require app permissions and customer search strips filter syntax', () => {
  const daftra = read('supabase/functions/daftra-mcp/index.ts');
  assert.match(daftra, /getAuthenticatedUser\(request\)/);
  assert.match(daftra, /users\.manage/);
  assert.match(daftra, /contacts\.manage/);
  assert.match(daftra, /hasOrganizationPermission\(user, organizationId, requiresPermission\)/);

  const contacts = read('src/lib/contacts.functions.ts');
  assert.match(contacts, /replace\(\/\[\\u0000-\\u001f%_\*\(\),\\\\\]\/g, " "\)/);
  assert.match(contacts, /\.slice\(0, 100\)/);
});

test('customer phone numbers and message text are not written to selected diagnostic logs', () => {
  const chatbot = read('supabase/functions/chatbot_engine/index.ts');
  assert.doesNotMatch(chatbot, /replyText\.substring\(0, 50\)/);
  assert.doesNotMatch(chatbot, /AI reply sent to \$\{fromPhone\}/);

  const broadcast = read('supabase/functions/broadcast_send/index.ts');
  assert.doesNotMatch(broadcast, /Failed to send to \$\{contact\.phone_e164\}/);

  const webhook = read('supabase/functions/whatsapp_webhook/index.ts');
  assert.doesNotMatch(webhook, /from:\$\{fromPhone\}/);
});
