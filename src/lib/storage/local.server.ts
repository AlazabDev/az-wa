import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";

export const LOCAL_PROVIDER = "local";

// المجلد الأساسي لتخزين الوسائط
const STORAGE_ROOT = path.resolve(process.env["LOCAL_STORAGE_DIR"] || "./storage/media");

/**
 * توليد رمز عام عشوائي فريد وغير قابل للتخمين بطول 48 حرفاً ست عشرياً
 */
export function newPublicToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * بناء الرابط العام الدائم للملف
 */
export function publicFileUrl(token: string): string {
  const baseUrl = process.env["PUBLIC_APP_URL"] || "https://wa.alazab.com";
  return `${baseUrl.replace(/\/$/, "")}/api/public/files/${token}`;
}

/**
 * حماية المسار من هجمات Path Traversal والتأكد من بقائه داخل مجلد التخزين
 */
function resolveSafePath(key: string): string {
  const normalized = path.normalize(key).replace(/^(\.\.[\/\\])+/, "");
  const fullPath = path.resolve(STORAGE_ROOT, normalized);
  if (!fullPath.startsWith(STORAGE_ROOT)) {
    throw new Error("Invalid storage path traversal");
  }
  return fullPath;
}

/**
 * حفظ تدفق الملف (Buffer أو Stream من Meta) داخل مجلد التخزين المحلي
 */
export async function putLocalObject({
  key,
  body,
}: {
  key: string;
  body: ReadableStream | NodeJS.ReadableStream | Buffer | Uint8Array;
}): Promise<{ key: string; size: number }> {
  const fullPath = resolveSafePath(key);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });

  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    await fs.writeFile(fullPath, body);
    return { key, size: body.byteLength };
  }

  // معالجة Streams القادمة من Fetch الخاص بميتا
  const nodeStream =
    "getReader" in (body as any)
      ? Readable.fromWeb(body as import("node:stream/web").ReadableStream)
      : (body as NodeJS.ReadableStream);

  const writeStream = createWriteStream(fullPath);
  await pipeline(nodeStream, writeStream);

  const stats = await fs.stat(fullPath);
  return { key, size: stats.size };
}

/**
 * قراءة الملف كـ Buffer لتقديمه عند زيارة الرابط العام
 */
export async function readLocalObject(key: string): Promise<Buffer> {
  const fullPath = resolveSafePath(key);
  return await fs.readFile(fullPath);
}

/**
 * حذف الملف من القرص المحلي
 */
export async function deleteLocalObject(key: string): Promise<void> {
  try {
    const fullPath = resolveSafePath(key);
    await fs.unlink(fullPath);
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
}
