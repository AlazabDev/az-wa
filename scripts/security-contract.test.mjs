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
