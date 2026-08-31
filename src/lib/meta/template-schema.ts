export type TemplateDefinitionComponent = Record<string, unknown>;

type AnyRecord = Record<string, unknown>;

const HEADER_FORMATS = new Set(["TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"]);
const BUTTON_TYPES = new Set([
  "QUICK_REPLY",
  "URL",
  "PHONE_NUMBER",
  "FLOW",
  "CATALOG",
  "MPM",
  "OTP",
]);

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function componentType(component: TemplateDefinitionComponent) {
  return String(component["type"] ?? "")
    .trim()
    .toUpperCase();
}

export function validateTemplateDefinition(input: {
  category: string;
  components: TemplateDefinitionComponent[];
}): string[] {
  const errors: string[] = [];
  const category = input.category.trim().toUpperCase();
  const components = input.components;

  if (!Array.isArray(components) || components.length === 0) {
    return ["At least one template component is required"];
  }

  const body = components.find((component) => componentType(component) === "BODY");
  if (!body) errors.push("A BODY component is required");

  components.forEach((component, componentIndex) => {
    const type = componentType(component);
    const prefix = `Component ${componentIndex + 1}`;

    if (!type) {
      errors.push(`${prefix}: type is required`);
      return;
    }

    if (type === "HEADER") {
      const format = String(component["format"] ?? "TEXT")
        .trim()
        .toUpperCase();
      if (!HEADER_FORMATS.has(format)) {
        errors.push(`${prefix}: unsupported HEADER format ${format || "(empty)"}`);
      }

      if (format === "TEXT" && !nonEmptyString(component["text"])) {
        errors.push(`${prefix}: TEXT header requires text`);
      }

      if (["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) {
        const example = component["example"];
        const handles = isRecord(example) ? example["header_handle"] : null;
        if (!Array.isArray(handles) || !handles.some(nonEmptyString)) {
          errors.push(
            `${prefix}: ${format} header requires example.header_handle from Meta resumable upload`,
          );
        }
      }
    }

    if (type === "BODY" && category !== "AUTHENTICATION" && !nonEmptyString(component["text"])) {
      errors.push(`${prefix}: BODY text is required`);
    }

    if (type === "FOOTER") {
      const hasText = nonEmptyString(component["text"]);
      const hasExpiration = Number.isFinite(Number(component["code_expiration_minutes"]));
      if (!hasText && !hasExpiration) {
        errors.push(`${prefix}: FOOTER requires text or code_expiration_minutes`);
      }
    }

    if (type === "BUTTONS") {
      const buttons = component["buttons"];
      if (!Array.isArray(buttons) || buttons.length === 0) {
        errors.push(`${prefix}: BUTTONS requires at least one button`);
        return;
      }

      buttons.forEach((rawButton, buttonIndex) => {
        const buttonPrefix = `${prefix}, button ${buttonIndex + 1}`;
        if (!isRecord(rawButton)) {
          errors.push(`${buttonPrefix}: invalid button object`);
          return;
        }

        const buttonType = String(rawButton["type"] ?? "")
          .trim()
          .toUpperCase();
        if (!BUTTON_TYPES.has(buttonType)) {
          errors.push(`${buttonPrefix}: unsupported button type ${buttonType || "(empty)"}`);
          return;
        }

        if (!nonEmptyString(rawButton["text"]) && buttonType !== "MPM") {
          errors.push(`${buttonPrefix}: text is required`);
        }

        if (buttonType === "URL" && !nonEmptyString(rawButton["url"])) {
          errors.push(`${buttonPrefix}: URL button requires url`);
        }
        if (buttonType === "PHONE_NUMBER" && !nonEmptyString(rawButton["phone_number"])) {
          errors.push(`${buttonPrefix}: PHONE_NUMBER button requires phone_number`);
        }
        if (buttonType === "FLOW" && !nonEmptyString(rawButton["flow_id"])) {
          errors.push(`${buttonPrefix}: FLOW button requires flow_id`);
        }
        if (buttonType === "OTP") {
          const otpType = String(rawButton["otp_type"] ?? "")
            .trim()
            .toUpperCase();
          if (category !== "AUTHENTICATION") {
            errors.push(`${buttonPrefix}: OTP buttons require AUTHENTICATION category`);
          }
          if (!new Set(["COPY_CODE", "ONE_TAP", "ZERO_TAP"]).has(otpType)) {
            errors.push(`${buttonPrefix}: unsupported otp_type ${otpType || "(empty)"}`);
          }
          if (otpType === "ONE_TAP") {
            if (!nonEmptyString(rawButton["package_name"])) {
              errors.push(`${buttonPrefix}: ONE_TAP requires package_name`);
            }
            if (!nonEmptyString(rawButton["signature_hash"])) {
              errors.push(`${buttonPrefix}: ONE_TAP requires signature_hash`);
            }
          }
        }
      });
    }
  });

  if (category === "AUTHENTICATION") {
    const buttons = components
      .filter((component) => componentType(component) === "BUTTONS")
      .flatMap((component) => (Array.isArray(component["buttons"]) ? component["buttons"] : []))
      .filter(isRecord);
    if (!buttons.some((button) => String(button["type"] ?? "").toUpperCase() === "OTP")) {
      errors.push("AUTHENTICATION templates require an OTP button");
    }
  }

  return errors;
}
