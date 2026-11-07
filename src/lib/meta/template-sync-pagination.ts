/** Pure, reusable Meta Graph pagination validation for WABA templates. */
export type MetaTemplateSnapshot = {
  id: string;
  name: string;
  language: string;
  category?: string;
  status?: string;
  quality_score?: { score?: string };
  rejected_reason?: string;
  components?: Record<string, unknown>[];
};

export type TemplatePage = {
  data?: MetaTemplateSnapshot[];
  paging?: { cursors?: { after?: string }; next?: string };
};

export const MAX_TEMPLATE_PAGES = 100;

export function validateTemplatePage(page: TemplatePage | null): MetaTemplateSnapshot[] {
  if (!page || !Array.isArray(page.data)) {
    throw new Error("Meta returned an invalid template listing; local records were not changed");
  }
  for (const item of page.data) {
    if (!item || typeof item.id !== "string" || !item.id ||
        typeof item.name !== "string" || !item.name ||
        typeof item.language !== "string" || !item.language) {
      throw new Error("Meta returned a template without id, name or language");
    }
  }
  return page.data;
}

/** Return undefined only for a verified last page. Never treat a broken cursor as success. */
export function nextTemplateCursor(page: TemplatePage, seen: Set<string>): string | undefined {
  if (!page.paging?.next) return undefined;
  const cursor = page.paging.cursors?.after;
  if (!cursor || seen.has(cursor)) {
    throw new Error("Meta template pagination cursor is missing or repeated");
  }
  seen.add(cursor);
  return cursor;
}
