// Shared domain types derived from Supabase enums — no more `as any`
import type { Database } from "@/integrations/supabase/types";

type Enums = Database["public"] extends { Enums: infer E } ? E : Record<string, any>;

export type MsgDirection = Enums extends { msg_direction: infer T } ? T : "inbound" | "outbound";
export type MsgStatus = Enums extends { msg_status: infer T }
  ? T
  : "sent" | "delivered" | "read" | "failed";
export type ConvStatus = Enums extends { conv_status: infer T } ? T : "open" | "closed" | "pending";
export type MediaKind = Enums extends { media_kind: infer T }
  ? T
  : "image" | "video" | "audio" | "document" | "sticker";
export type TmplCategory = Enums extends { tmpl_category: infer T }
  ? T
  : "UTILITY" | "MARKETING" | "AUTHENTICATION";
export type TmplStatus = Enums extends { tmpl_status: infer T }
  ? T
  : "APPROVED" | "PENDING" | "REJECTED";
export type MemberRole = Enums extends { member_role: infer T } ? T : "owner" | "admin" | "member";
export type WaNumberType = Enums extends { wa_number_type: infer T } ? T : "whatsapp";

// Row helpers
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Message = Tables<"messages">;
export type Conversation = Tables<"conversations">;
export type Contact = Tables<"contacts">;
export type WaNumber = Tables<"whatsapp_numbers">;
export type WaAccount = Tables<"wabas">;
export type Template = Tables<"templates">;
export type MediaFile = Tables<"media">;
export type Workflow = any;
export type AuditLog = Tables<"audit_logs">;
export type ApiKey = any;
export type WebhookEndpoint = any;
