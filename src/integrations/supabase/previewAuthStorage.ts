// Production auth storage for wa.alazab.com.
// No Lovable preview broker, postMessage bridge, project id, or editor origin logic.
export function productionAuthStorage() {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}
