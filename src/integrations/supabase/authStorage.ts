// Browser session storage for the production AzWA application.
// Server-side execution has no browser storage and therefore returns undefined.
export function productionAuthStorage() {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}
