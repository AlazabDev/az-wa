import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeWhatsappPhone, whatsappAccountName, whatsappAccountLabel } from "../src/lib/azwa-number-labels.ts";

const read = (path) => readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

const accounts = [
  ["201202334066", "Mohamed Azab"],
  ["201146395966", "Alazab Arc"],
  ["201092750351", "Alazab"],
  ["1205-460-5650", "Mohamed Azab"],
  ["1208-379-9564", "Mohamed Azab"],
  ["201146397010", "Alazab"],
  ["1555-724-5001", "alazab"],
  ["1555-678-2228", "Test Number"],
  ["1203-204-7240", "Mohamed Azab"],
];
test("all nine supplied WhatsApp accounts resolve to their exact names", () => {
  assert.equal(accounts.length, 9);
  for (const [phone, name] of accounts) {
    assert.equal(whatsappAccountName(phone), name, phone);
    assert.equal(whatsappAccountName("+" + phone), name, phone);
    assert.match(whatsappAccountLabel(phone), new RegExp(name, "i"));
  }
  assert.equal(normalizeWhatsappPhone("+1 (205) 460-5650"), "12054605650");
});
test("unlisted numbers are labelled without revealing a Meta identifier", () => {
  assert.equal(whatsappAccountName("+201000000000"), "حساب واتساب");
  assert.equal(whatsappAccountName("+201000000000", "Verified account"), "Verified account");
  assert.doesNotMatch(read("src/components/azwa/scope-selector.tsx"), /n\.meta_phone_number_id|w\.meta_waba_id|p\.meta_business_id/);
});
test("scope changes reconcile removed IDs and refresh number-scoped tables", () => {
  const selector = read("src/components/azwa/scope-selector.tsx");
  const table = read("src/components/azwa/record-table.tsx");
  const server = read("src/lib/record-table.functions.ts");
  assert.match(selector, /if \(!selected\)/);
  assert.match(selector, /setScope\(next\)/);
  assert.match(table, /scopeNumberIds/);
  assert.match(table, /scopeKey/);
  assert.match(server, /Invalid organization number scope/);
  assert.match(server, /numberScopedTables/);
});
test("inbox replies resolve WhatsApp phone numbers on the authenticated server", () => {
  const inbox = read("src/routes/_authenticated/inbox.tsx");
  const send = read("src/lib/meta/messaging.functions.ts");
  assert.match(inbox, /recipient: ""/);
  assert.match(send, /from\("contact_channels"\)/);
  assert.match(send, /conversation\.contact_id/);
  assert.match(send, /\.eq\("organization_id", number\.organization_id\)/);
  assert.doesNotMatch(inbox, /recipient = lastIncoming\?\.contact_id/);
});
