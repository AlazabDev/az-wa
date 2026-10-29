import assert from "node:assert/strict";
import test from "node:test";
import { parseEmbeddedSignupEvent } from "../src/lib/meta/embedded-signup-session.ts";

const finish = JSON.stringify({
  type: "WA_EMBEDDED_SIGNUP",
  event: "FINISH",
  data: { waba_id: "123", phone_number_id: "456", business_id: "789" },
});

test("parses a valid Meta FINISH event", () => {
  assert.deepEqual(parseEmbeddedSignupEvent("https://www.facebook.com", finish), {
    kind: "finished",
    wabaId: "123",
    phoneNumberId: "456",
    businessId: "789",
  });
});
test("rejects non-Meta origins", () => {
  assert.equal(parseEmbeddedSignupEvent("https://malicious.example", finish), null);
});
test("rejects missing required identifiers", () => {
  assert.equal(parseEmbeddedSignupEvent("https://www.facebook.com", {
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH",
    data: { waba_id: "123" },
  }), null);
});
test("handles cancellation and invalid JSON without crashing", () => {
  assert.deepEqual(parseEmbeddedSignupEvent("https://www.facebook.com", {
    type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { current_step: "PHONE" },
  }), { kind: "cancelled", currentStep: "PHONE" });
  assert.equal(parseEmbeddedSignupEvent("https://www.facebook.com", "{"), null);
});
