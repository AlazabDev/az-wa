import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyMetaSignature } from '../supabase/functions/_shared/meta-signature.mjs';

const secret = 'sample-meta-app-secret';
const body = '{"object":"whatsapp_business_account","entry":[]}';
const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

test('accepts genuine Meta signature for raw text', async () => {
  assert.equal(await verifyMetaSignature(body, signature, secret), true);
});
test('accepts genuine Meta signature for exact raw ArrayBuffer', async () => {
  const bytes = new TextEncoder().encode(body);
  assert.equal(await verifyMetaSignature(bytes.buffer, signature, secret), true);
});
test('rejects when app secret is missing', async () => {
  assert.equal(await verifyMetaSignature(body, signature, ''), false);
});
test('rejects a missing signature', async () => {
  assert.equal(await verifyMetaSignature(body, null, secret), false);
});
test('rejects modified body', async () => {
  assert.equal(await verifyMetaSignature(body + ' ', signature, secret), false);
});
test('rejects tampered signature', async () => {
  assert.equal(await verifyMetaSignature(body, signature.slice(0, -1) + (signature.endsWith('a') ? 'b' : 'a'), secret), false);
});
test('rejects malformed or non-SHA256 signatures', async () => {
  for (const value of ['sha1=abc', 'sha256=xx', 'sha256=', signature + 'x', 'sha256=' + 'a'.repeat(63)]) {
    assert.equal(await verifyMetaSignature(body, value, secret), false);
  }
});
test('does not accept unexpected body types', async () => {
  assert.equal(await verifyMetaSignature({ object: 'whatsapp_business_account' }, signature, secret), false);
});
test('supports Uint8Array slices without using offset bytes', async () => {
  const raw = new TextEncoder().encode('prefix' + body + 'suffix');
  const slice = raw.subarray(6, raw.length - 6);
  assert.equal(await verifyMetaSignature(slice, signature, secret), true);
});
