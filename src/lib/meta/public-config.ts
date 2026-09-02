/**
 * Canonical public endpoints for the AzWA production deployment.
 *
 * Every Meta-facing URL (webhook callback, OAuth/embedded-signup redirects)
 * must resolve to the production domain, never to a preview or localhost
 * origin — Meta only accepts the registered public callback.
 */
export const PRODUCTION_ORIGIN = "https://wa.alazab.com";

/** Public Meta webhook callback registered in the Meta App. */
export const META_WEBHOOK_PATH = "/webhooks/meta/whatsapp";

/** Internal TanStack route the reverse proxy maps the public callback to. */
export const META_WEBHOOK_INTERNAL_PATH = "/api/public/webhooks/meta/whatsapp";

export const META_WEBHOOK_CALLBACK_URL = `${PRODUCTION_ORIGIN}${META_WEBHOOK_PATH}`;

/** Protected media-retry worker endpoint. */
export const MEDIA_WORKER_URL = `${PRODUCTION_ORIGIN}/api/public/jobs/media`;

/** Absolute production URL for any app path (used for Meta redirect URIs). */
export function productionUrl(path: string) {
  return `${PRODUCTION_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}
