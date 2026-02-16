/**
 * Drop-in replacement for fetch() that adds CSRF protection headers.
 * Use this for all state-changing requests (POST, PUT, PATCH, DELETE)
 * from the frontend.
 */
export async function apiFetch(
  url: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("X-Requested-With", "XMLHttpRequest");
  return fetch(url, { ...init, headers });
}
