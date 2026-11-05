import { describe, it, expect } from "vitest";
import { buildComponents, validateTemplate, type TemplateForm } from "@/lib/templates";

const base: TemplateForm = { id: null, account_id: "a", name: "order_update", language: "ar", category: "UTILITY", header: "", body: "مرحباً {{1}}، طلبك رقم {{2}} في الطريق إليك اليوم", footer: "", examples: ["أحمد", "A12"], otpButton: "نسخ", securityRecommendation: true };

describe("templates", () => {
  it("requires an example per variable", () => expect(validateTemplate({ ...base, examples: ["أحمد"] })).not.toBeNull());
  it("rejects uppercase names", () => expect(validateTemplate({ ...base, name: "Order" })).not.toBeNull());
  it("accepts a valid utility template", () => expect(validateTemplate(base)).toBeNull());
  it("adds body examples", () => expect((buildComponents(base)[0] as any).example.body_text[0]).toEqual(["أحمد", "A12"]));
  it("auth template uses OTP copy button", () => expect((buildComponents({ ...base, category: "AUTHENTICATION" })[1] as any).buttons[0].otp_type).toBe("COPY_CODE"));
});
