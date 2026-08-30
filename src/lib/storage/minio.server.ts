import { createHash, createHmac } from "node:crypto";

export type MinioUploadResult = {
  bucket: string;
  key: string;
  etag: string | null;
  status: number;
};

type MinioConfig = {
  endpoint: URL;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
};

function optionalEnv(name: string): string | undefined {
  const value = Reflect.get(process.env, name) as string | undefined;
  return value?.trim() || undefined;
}

function requiredEnv(name: string): string {
  const value = optionalEnv(name);
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function readConfig(): MinioConfig {
  const endpoint = new URL(requiredEnv("MINIO_ENDPOINT"));
  endpoint.pathname = endpoint.pathname.replace(/\/$/, "");

  return {
    endpoint,
    accessKey: requiredEnv("MINIO_ACCESS_KEY"),
    secretKey: requiredEnv("MINIO_SECRET_KEY"),
    bucket:
      optionalEnv("MINIO_BUCKET_NAME") ??
      optionalEnv("MINIO_BUCKET") ??
      "az-bk-whatsapp",
    region: optionalEnv("MINIO_REGION") ?? "us-east-1",
  };
}

function hashHex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeObjectKey(key: string): string {
  return key
    .split("/")
    .filter(Boolean)
    .map(encodePathPart)
    .join("/");
}

function timestampParts(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const amzDate = iso.slice(0, 15) + "Z";
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function signingKey(
  secretKey: string,
  dateStamp: string,
  region: string,
): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

/**
 * Uploads one private object to the configured MinIO bucket using AWS SigV4.
 * This intentionally uses Node's native fetch/crypto so AzWA does not need a
 * second S3 SDK just for inbound WhatsApp media storage.
 */
export async function putMinioObject(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<MinioUploadResult> {
  const config = readConfig();
  const { amzDate, dateStamp } = timestampParts();
  const requestBody = Uint8Array.from(input.body);
  const payloadHash = hashHex(requestBody);

  const bucketPath = encodePathPart(config.bucket);
  const objectPath = encodeObjectKey(input.key);
  const basePath = config.endpoint.pathname.replace(/\/$/, "");
  const canonicalUri = `${basePath}/${bucketPath}/${objectPath}`.replace(
    /\/+/g,
    "/",
  );

  const host = config.endpoint.host;
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    hashHex(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(config.secretKey, dateStamp, config.region),
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const target = new URL(config.endpoint.toString());
  target.pathname = canonicalUri;
  target.search = "";

  const response = await fetch(target, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-Type": input.contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    body: requestBody.buffer,
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 1000);
    throw new Error(
      `MinIO upload failed (HTTP ${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  return {
    bucket: config.bucket,
    key: input.key,
    etag: response.headers.get("etag")?.replaceAll('"', "") ?? null,
    status: response.status,
  };
}
