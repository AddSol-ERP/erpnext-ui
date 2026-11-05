/** Frappe assets live with the backend, including when Vite runs separately. */
export function frappeAssetUrl(path, apiBase, frontendOrigin) {
  const backend = new URL(apiBase || "/api", frontendOrigin);
  return new URL(path, backend.origin).href;
}
