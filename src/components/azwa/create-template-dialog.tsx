import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, FileText, Loader2, Send as SendIcon, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  bodyText,
  buttonsOf,
  componentOf,
  placeholdersOf,
  type TemplateComponent,
} from "@/lib/azwa-templates";
import { validateTemplateDefinition } from "@/lib/meta/template-schema";
import { createTemplate } from "@/lib/meta/templates.functions";

const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20";
const textareaClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20";

const KINDS = ["STANDARD", "AUTHENTICATION", "CATALOG", "FLOW", "EXPERT"] as const;
const CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const;
const LANGUAGES = ["ar", "ar_EG", "en", "en_US"] as const;
const HEADER_FORMATS = ["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"] as const;

type Kind = (typeof KINDS)[number];
type Category = (typeof CATEGORIES)[number];
type Language = (typeof LANGUAGES)[number];
type HeaderFormat = (typeof HEADER_FORMATS)[number];

type Props = {
  wabas: { id: string; label: string }[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
};

function lines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function bodyWithExamples(body: string, examplesText: string): TemplateComponent | null {
  const text = body.trim();
  if (!text) return null;
  const variables = placeholdersOf([{ type: "BODY", text }]);
  const examples = lines(examplesText);
  return {
    type: "BODY",
    text,
    ...(variables.length > 0
      ? {
          example: {
            body_text: [variables.map((name, index) => examples[index] ?? `sample_${name}`)],
          },
        }
      : {}),
  };
}

function textHeader(header: string, examplesText: string): TemplateComponent | null {
  const text = header.trim();
  if (!text) return null;
  const variables = placeholdersOf([{ type: "HEADER", text }]);
  const examples = lines(examplesText);
  return {
    type: "HEADER",
    format: "TEXT",
    text,
    ...(variables.length > 0
      ? {
          example: {
            header_text: variables.map((name, index) => examples[index] ?? `sample_${name}`),
          },
        }
      : {}),
  };
}

function Preview({ components }: { components: TemplateComponent[] }) {
  const header = componentOf(components, "HEADER");
  const footer = componentOf(components, "FOOTER");
  const buttons = buttonsOf(components);

  return (
    <div className="rounded-xl border border-border bg-[#efeae2] p-5">
      <div className="max-w-[320px] rounded-lg bg-white p-3 text-slate-900 shadow-sm">
        {header?.text && <p className="mb-1 text-sm font-semibold">{header.text}</p>}
        {header?.format && header.format !== "TEXT" && (
          <p className="mb-2 rounded bg-slate-100 p-2 text-[11px] uppercase text-slate-500">
            {header.format} HEADER
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {bodyText(components) || "Meta-generated authentication body"}
        </p>
        {footer?.text && <p className="mt-2 text-[11px] text-slate-500">{footer.text}</p>}
        {footer?.code_expiration_minutes != null && (
          <p className="mt-2 text-[11px] text-slate-500">
            Code expires in {footer.code_expiration_minutes} minute(s)
          </p>
        )}
        {buttons.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-slate-200 pt-2">
            {buttons.map((button, index) => (
              <p
                key={`${button.type ?? "button"}-${button.text ?? index}-${index}`}
                className="text-center text-xs font-medium text-sky-600"
              >
                {button.text ?? button.type ?? "Button"}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function CreateTemplateDialog({ wabas, onClose, onCreated }: Props) {
  const create = useServerFn(createTemplate);
  const [wabaId, setWabaId] = useState(wabas[0]?.id ?? "");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("STANDARD");
  const [category, setCategory] = useState<Category>("UTILITY");
  const [language, setLanguage] = useState<Language>("ar");

  const [headerFormat, setHeaderFormat] = useState<HeaderFormat>("NONE");
  const [header, setHeader] = useState("");
  const [headerExamples, setHeaderExamples] = useState("");
  const [headerHandle, setHeaderHandle] = useState("");
  const [body, setBody] = useState("");
  const [bodyExamples, setBodyExamples] = useState("");
  const [footer, setFooter] = useState("");

  const [quickReplies, setQuickReplies] = useState("");
  const [ctaUrlText, setCtaUrlText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [ctaUrlExample, setCtaUrlExample] = useState("");
  const [ctaPhoneText, setCtaPhoneText] = useState("");
  const [ctaPhone, setCtaPhone] = useState("");

  const [catalogButtonType, setCatalogButtonType] = useState<"CATALOG" | "MPM">("CATALOG");
  const [catalogButtonText, setCatalogButtonText] = useState("View catalog");

  const [flowId, setFlowId] = useState("");
  const [flowButtonText, setFlowButtonText] = useState("Open flow");
  const [flowScreen, setFlowScreen] = useState("");

  const [authSecurityRecommendation, setAuthSecurityRecommendation] = useState(true);
  const [authExpiration, setAuthExpiration] = useState("10");
  const [authOtpType, setAuthOtpType] = useState<"COPY_CODE" | "ONE_TAP">("COPY_CODE");
  const [authButtonText, setAuthButtonText] = useState("Copy Code");
  const [authAutofillText, setAuthAutofillText] = useState("Autofill");
  const [authPackageName, setAuthPackageName] = useState("");
  const [authSignatureHash, setAuthSignatureHash] = useState("");

  const [expertComponents, setExpertComponents] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [chatMessages, setChatMessages] = useState<{ role: "user" | "agent"; text: string }[]>([
    {
      role: "agent",
      text: "مرحباً! أنا المساعد الذكي من Foundry. أخبرني عن نوع القالب الذي تود إنشاؤه وسأقوم باقتراح المحتوى لك.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setChatInput("");
    setIsTyping(true);

    setTimeout(() => {
      let reply = "هذا قالب مقترح بناءً على طلبك.";
      let suggestedBody = "";
      let suggestedHeader = "";

      if (userMsg.includes("خصم") || userMsg.includes("عرض")) {
        suggestedHeader = "عرض خاص لك! 🎁";
        suggestedBody =
          "مرحباً {{1}}،\n\nنقدم لك خصم حصري بنسبة 20% على جميع منتجاتنا بمناسبة الموسم الجديد.\n\nاستخدم الكود: DISCOUNT20\n\nتسوق الآن واستفد من العرض قبل انتهائه!";
        reply = "لقد قمت بإعداد قالب ترويجي يحتوي على متغير للاسم. يمكنك تطبيقه الآن.";
      } else if (userMsg.includes("تذكير") || userMsg.includes("موعد")) {
        suggestedHeader = "تذكير بموعدك 📅";
        suggestedBody =
          "مرحباً {{1}}،\n\nنود تذكيرك بموعدك القادم يوم {{2}} الساعة {{3}}.\n\nيرجى التواصل معنا في حال رغبتك بتعديل الموعد.";
        reply = "إليك قالب تذكير بالموعد مع 3 متغيرات جاهز للاستخدام.";
      } else {
        suggestedBody = `مرحباً {{1}}،\n\nنود إعلامك بخصوص استفسارك الأخير.\n\nلمزيد من التفاصيل، يرجى التواصل معنا.\n\nشكراً لك!`;
        reply = "لقد قمت بصياغة رسالة عامة بناءً على طلبك. هل ترغب في تعديلها؟";
      }

      setChatMessages((prev) => [
        ...prev,
        { role: "agent", text: reply, suggestedBody, suggestedHeader } as any,
      ]);
      setIsTyping(false);
    }, 1500);
  };

  const applySuggestion = (bodyText: string, headerText?: string) => {
    setBody(bodyText);
    if (headerText) {
      setHeaderFormat("TEXT");
      setHeader(headerText);
    }
    toast.success("تم تطبيق اقتراح المساعد الذكي");
  };

  const effectiveCategory: Category = kind === "AUTHENTICATION" ? "AUTHENTICATION" : category;

  const parsedExpert = useMemo<TemplateComponent[] | null>(() => {
    if (!expertComponents.trim()) return null;
    try {
      const parsed = JSON.parse(expertComponents) as unknown;
      return Array.isArray(parsed) ? (parsed as TemplateComponent[]) : null;
    } catch {
      return null;
    }
  }, [expertComponents]);

  const components = useMemo<TemplateComponent[]>(() => {
    if (kind === "EXPERT") return parsedExpert ?? [];

    if (kind === "AUTHENTICATION") {
      const expiration = Math.max(1, Math.min(90, Number(authExpiration) || 10));
      return [
        {
          type: "BODY",
          add_security_recommendation: authSecurityRecommendation,
        },
        {
          type: "FOOTER",
          code_expiration_minutes: expiration,
        },
        {
          type: "BUTTONS",
          buttons: [
            {
              type: "OTP",
              otp_type: authOtpType,
              text: authButtonText.trim() || "Copy Code",
              ...(authOtpType === "ONE_TAP"
                ? {
                    autofill_text: authAutofillText.trim() || "Autofill",
                    package_name: authPackageName.trim(),
                    signature_hash: authSignatureHash.trim(),
                  }
                : {}),
            },
          ],
        },
      ];
    }

    const result: TemplateComponent[] = [];

    if (kind === "STANDARD") {
      if (headerFormat === "TEXT") {
        const component = textHeader(header, headerExamples);
        if (component) result.push(component);
      } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat)) {
        result.push({
          type: "HEADER",
          format: headerFormat,
          ...(headerHandle.trim() ? { example: { header_handle: [headerHandle.trim()] } } : {}),
        });
      } else if (headerFormat === "LOCATION") {
        result.push({ type: "HEADER", format: "LOCATION" });
      }
    }

    const bodyComponent = bodyWithExamples(body, bodyExamples);
    if (bodyComponent) result.push(bodyComponent);
    if (footer.trim()) result.push({ type: "FOOTER", text: footer.trim() });

    if (kind === "CATALOG") {
      result.push({
        type: "BUTTONS",
        buttons: [
          {
            type: catalogButtonType,
            text:
              catalogButtonText.trim() ||
              (catalogButtonType === "CATALOG" ? "View catalog" : "View items"),
          },
        ],
      });
      return result;
    }

    if (kind === "FLOW") {
      result.push({
        type: "BUTTONS",
        buttons: [
          {
            type: "FLOW",
            text: flowButtonText.trim() || "Open flow",
            flow_id: flowId.trim(),
            flow_action: "navigate",
            ...(flowScreen.trim() ? { navigate_screen: flowScreen.trim() } : {}),
          },
        ],
      });
      return result;
    }

    const buttons: NonNullable<TemplateComponent["buttons"]> = lines(quickReplies).map((text) => ({
      type: "QUICK_REPLY",
      text,
    }));
    if (ctaUrlText.trim() || ctaUrl.trim()) {
      buttons.push({
        type: "URL",
        text: ctaUrlText.trim(),
        url: ctaUrl.trim(),
        ...(placeholdersOf([{ type: "BUTTONS", buttons: [{ type: "URL", url: ctaUrl }] }]).length >
          0 && ctaUrlExample.trim()
          ? { example: [ctaUrlExample.trim()] }
          : {}),
      });
    }
    if (ctaPhoneText.trim() || ctaPhone.trim()) {
      buttons.push({
        type: "PHONE_NUMBER",
        text: ctaPhoneText.trim(),
        phone_number: ctaPhone.trim(),
      });
    }
    if (buttons.length > 0) result.push({ type: "BUTTONS", buttons });

    return result;
  }, [
    kind,
    parsedExpert,
    authExpiration,
    authSecurityRecommendation,
    authOtpType,
    authButtonText,
    authAutofillText,
    authPackageName,
    authSignatureHash,
    headerFormat,
    header,
    headerExamples,
    headerHandle,
    body,
    bodyExamples,
    footer,
    catalogButtonType,
    catalogButtonText,
    flowButtonText,
    flowId,
    flowScreen,
    quickReplies,
    ctaUrlText,
    ctaUrl,
    ctaUrlExample,
    ctaPhoneText,
    ctaPhone,
  ]);

  const validationErrors = useMemo(
    () => validateTemplateDefinition({ category: effectiveCategory, components }),
    [effectiveCategory, components],
  );

  function changeKind(value: Kind) {
    setKind(value);
    if (value === "AUTHENTICATION") setCategory("AUTHENTICATION");
    else if (value === "CATALOG" || value === "FLOW") setCategory("MARKETING");
    else if (category === "AUTHENTICATION") setCategory("UTILITY");
  }

  const submit = async () => {
    if (!wabaId) {
      toast.error("Select a WABA");
      return;
    }
    if (!name.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (kind === "EXPERT" && !parsedExpert) {
      toast.error("Expert components JSON is invalid");
      return;
    }
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0] as string);
      return;
    }

    setSubmitting(true);
    try {
      const result = await create({
        data: {
          wabaId,
          name,
          category: effectiveCategory,
          language,
          components,
          allowCategoryChange: true,
        },
      });
      if (!result.ok) throw new Error(result.error ?? "Submission failed");
      toast.success("Template submitted to Meta for review");
      await onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex max-h-[95vh] w-full max-w-[95vw] lg:max-w-7xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-foreground">Create Message Template</h2>
              <p className="text-xs text-muted-foreground">
                Draft and submit a new template to Meta for review.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Body — 3-column grid */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_300px_320px]">
          {/* Column 1: Form */}
          <div className="overflow-y-auto border-r border-border p-5">
            {/* WABA + meta fields */}
            <div className="mb-4">
              <Field label="WABA">
                <select
                  className={inputClass}
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                >
                  {wabas.map((waba) => (
                    <option key={waba.id} value={waba.id}>
                      {waba.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Name">
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="service_request_update"
                />
              </Field>
              <Field label="Template type">
                <select
                  className={inputClass}
                  value={kind}
                  onChange={(e) => changeKind(e.target.value as Kind)}
                >
                  {KINDS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Category">
                <select
                  className={inputClass}
                  value={effectiveCategory}
                  disabled={kind === "AUTHENTICATION"}
                  onChange={(e) => setCategory(e.target.value as Category)}
                >
                  {CATEGORIES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Language">
                <select
                  className={inputClass}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                >
                  {LANGUAGES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Type-specific fields */}
            {kind === "AUTHENTICATION" && (
              <div className="mb-4 space-y-4 rounded-lg border border-border p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="OTP button type">
                    <select
                      className={inputClass}
                      value={authOtpType}
                      onChange={(e) => setAuthOtpType(e.target.value as "COPY_CODE" | "ONE_TAP")}
                    >
                      <option value="COPY_CODE">COPY_CODE</option>
                      <option value="ONE_TAP">ONE_TAP</option>
                    </select>
                  </Field>
                  <Field label="Code expiration (minutes)">
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      max={90}
                      value={authExpiration}
                      onChange={(e) => setAuthExpiration(e.target.value)}
                    />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={authSecurityRecommendation}
                    onChange={(e) => setAuthSecurityRecommendation(e.target.checked)}
                  />
                  Add Meta security recommendation
                </label>
                <Field label="OTP button text">
                  <input
                    className={inputClass}
                    value={authButtonText}
                    onChange={(e) => setAuthButtonText(e.target.value)}
                  />
                </Field>
                {authOtpType === "ONE_TAP" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Autofill text">
                      <input
                        className={inputClass}
                        value={authAutofillText}
                        onChange={(e) => setAuthAutofillText(e.target.value)}
                      />
                    </Field>
                    <Field label="Android package name">
                      <input
                        className={inputClass}
                        value={authPackageName}
                        onChange={(e) => setAuthPackageName(e.target.value)}
                        placeholder="com.example.app"
                      />
                    </Field>
                    <Field label="App signature hash">
                      <input
                        className={inputClass}
                        value={authSignatureHash}
                        onChange={(e) => setAuthSignatureHash(e.target.value)}
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}

            {kind === "EXPERT" && (
              <div className="mb-4">
                <Field label="Meta components JSON">
                  <textarea
                    className={`${textareaClass} min-h-72 font-mono text-xs`}
                    value={expertComponents}
                    onChange={(e) => setExpertComponents(e.target.value)}
                    placeholder='[{"type":"BODY","text":"..."},{"type":"BUTTONS","buttons":[...]}]'
                  />
                </Field>
              </div>
            )}

            {kind !== "AUTHENTICATION" && kind !== "EXPERT" && (
              <div className="space-y-4">
                {kind === "STANDARD" && (
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <Field label="Header format">
                      <select
                        className={inputClass}
                        value={headerFormat}
                        onChange={(e) => setHeaderFormat(e.target.value as HeaderFormat)}
                      >
                        {HEADER_FORMATS.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {headerFormat === "TEXT" && (
                      <>
                        <Field label="Header text">
                          <input
                            className={inputClass}
                            value={header}
                            onChange={(e) => setHeader(e.target.value)}
                          />
                        </Field>
                        {placeholdersOf([{ type: "HEADER", text: header }]).length > 0 && (
                          <Field label="Header review examples — one line per variable">
                            <textarea
                              className={`${textareaClass} min-h-20`}
                              value={headerExamples}
                              onChange={(e) => setHeaderExamples(e.target.value)}
                            />
                          </Field>
                        )}
                      </>
                    )}
                    {["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat) && (
                      <Field label="Meta header_handle from resumable upload">
                        <input
                          className={inputClass}
                          value={headerHandle}
                          onChange={(e) => setHeaderHandle(e.target.value)}
                          placeholder="4::..."
                        />
                      </Field>
                    )}
                  </div>
                )}

                <Field label="Body">
                  <textarea
                    className={`${textareaClass} min-h-32`}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="مرحبًا {{1}}، تم تحديث حالة الطلب {{2}}."
                  />
                </Field>
                {placeholdersOf([{ type: "BODY", text: body }]).length > 0 && (
                  <Field label="Body review examples — one line per variable">
                    <textarea
                      className={`${textareaClass} min-h-20`}
                      value={bodyExamples}
                      onChange={(e) => setBodyExamples(e.target.value)}
                      placeholder={"محمد\nAUF-1024"}
                    />
                  </Field>
                )}
                <Field label="Footer (optional)">
                  <input
                    className={inputClass}
                    value={footer}
                    onChange={(e) => setFooter(e.target.value)}
                  />
                </Field>

                {kind === "STANDARD" && (
                  <div className="space-y-4 rounded-lg border border-border p-4">
                    <Field label="Quick reply buttons — one per line">
                      <textarea
                        className={`${textareaClass} min-h-20`}
                        value={quickReplies}
                        onChange={(e) => setQuickReplies(e.target.value)}
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Website button text">
                        <input
                          className={inputClass}
                          value={ctaUrlText}
                          onChange={(e) => setCtaUrlText(e.target.value)}
                          placeholder="Open website"
                        />
                      </Field>
                      <Field label="Website URL">
                        <input
                          className={inputClass}
                          value={ctaUrl}
                          onChange={(e) => setCtaUrl(e.target.value)}
                          placeholder="https://example.com/order/{{1}}"
                        />
                      </Field>
                    </div>
                    {placeholdersOf([
                      { type: "BUTTONS", buttons: [{ type: "URL", url: ctaUrl }] },
                    ]).length > 0 && (
                      <Field label="Website URL review example">
                        <input
                          className={inputClass}
                          value={ctaUrlExample}
                          onChange={(e) => setCtaUrlExample(e.target.value)}
                          placeholder="AUF-1024"
                        />
                      </Field>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Phone button text">
                        <input
                          className={inputClass}
                          value={ctaPhoneText}
                          onChange={(e) => setCtaPhoneText(e.target.value)}
                          placeholder="Call us"
                        />
                      </Field>
                      <Field label="Phone number">
                        <input
                          className={inputClass}
                          value={ctaPhone}
                          onChange={(e) => setCtaPhone(e.target.value)}
                          placeholder="2010xxxxxxxx"
                        />
                      </Field>
                    </div>
                  </div>
                )}

                {kind === "CATALOG" && (
                  <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
                    <Field label="Commerce button type">
                      <select
                        className={inputClass}
                        value={catalogButtonType}
                        onChange={(e) =>
                          setCatalogButtonType(e.target.value as "CATALOG" | "MPM")
                        }
                      >
                        <option value="CATALOG">CATALOG</option>
                        <option value="MPM">MPM (multi-product)</option>
                      </select>
                    </Field>
                    <Field label="Button text">
                      <input
                        className={inputClass}
                        value={catalogButtonText}
                        onChange={(e) => setCatalogButtonText(e.target.value)}
                      />
                    </Field>
                  </div>
                )}

                {kind === "FLOW" && (
                  <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
                    <Field label="Flow ID">
                      <input
                        className={inputClass}
                        value={flowId}
                        onChange={(e) => setFlowId(e.target.value)}
                      />
                    </Field>
                    <Field label="Button text">
                      <input
                        className={inputClass}
                        value={flowButtonText}
                        onChange={(e) => setFlowButtonText(e.target.value)}
                      />
                    </Field>
                    <Field label="Navigate screen (optional)">
                      <input
                        className={inputClass}
                        value={flowScreen}
                        onChange={(e) => setFlowScreen(e.target.value)}
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Column 2: Preview + Validation */}
          <div className="flex flex-col gap-4 overflow-y-auto border-r border-border p-5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                WhatsApp preview
              </p>
              <Preview components={components} />
            </div>

            <div className="rounded-lg border border-border p-3 text-xs">
              <p className="font-semibold">Submission validation</p>
              {validationErrors.length === 0 ? (
                <p className="mt-1 text-muted-foreground">
                  Component structure is ready for Meta submission.
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-destructive">
                  {validationErrors.slice(0, 6).map((error) => (
                    <li key={error}>• {error}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p>Variables: {placeholdersOf(components).join(", ") || "none"}</p>
              <p className="mt-1">Category: {effectiveCategory}</p>
              <p className="mt-1">Components: {components.length}</p>
            </div>

            {/* Submit actions */}
            <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
              <Button
                onClick={() => void submit()}
                disabled={submitting || validationErrors.length > 0 || !name.trim() || !wabaId}
                className="w-full"
              >
                {submitting ? "Submitting…" : "Submit to Meta"}
              </Button>
              <Button variant="outline" onClick={onClose} disabled={submitting} className="w-full">
                Cancel
              </Button>
            </div>
          </div>

          {/* Column 3: AI Chat */}
          <div className="flex flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-primary/5 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Foundry Agent</p>
                <p className="text-[10px] text-muted-foreground">AI Template Assistant</p>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted text-foreground rounded-tl-sm"
                      }`}
                    >
                      <p
                        className="whitespace-pre-wrap leading-relaxed"
                        dir={msg.role === "agent" ? "rtl" : "auto"}
                      >
                        {msg.text}
                      </p>
                    </div>
                    {msg.role === "agent" && (msg as any).suggestedBody && (
                      <div
                        className="mt-2 w-full max-w-[90%] rounded-lg border border-primary/20 bg-primary/5 p-3"
                        dir="rtl"
                      >
                        <p className="mb-1 text-xs font-semibold text-primary">اقتراح القالب:</p>
                        {(msg as any).suggestedHeader && (
                          <p className="mb-1 text-xs font-medium text-foreground">
                            العنوان: {(msg as any).suggestedHeader}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                          {(msg as any).suggestedBody}
                        </p>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-3 h-7 w-full text-xs"
                          onClick={() =>
                            applySuggestion(
                              (msg as any).suggestedBody,
                              (msg as any).suggestedHeader,
                            )
                          }
                        >
                          تطبيق الاقتراح
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {isTyping && (
                  <div className="flex items-start">
                    <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm text-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="shrink-0 border-t border-border bg-muted/10 p-3">
              <div className="flex gap-2" dir="rtl">
                <input
                  className={`${inputClass} rounded-full`}
                  placeholder="اكتب طلبك للمساعد الذكي..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  disabled={isTyping}
                />
                <Button
                  size="icon"
                  className="shrink-0 rounded-full"
                  onClick={handleSendMessage}
                  disabled={isTyping || !chatInput.trim()}
                >
                  <SendIcon className="h-4 w-4 rtl:-scale-x-100" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
