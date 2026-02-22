import { RateLimitError } from "@/lib/rate-limit-utils";

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
  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && typeof window !== "undefined") {
    const { toast } = await import("sonner");
    toast.info("פג תוקף ההתחברות, מעביר לדף ההתחברות...", { id: "session-expired" });
    window.location.href = "/login";
  }

  return res;
}

/** Read error from a non-ok Response and throw with the server message. */
export async function throwResponseError(res: Response, fallback: string): Promise<never> {
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    throw new RateLimitError(body.error || body.message || "Rate limit exceeded");
  }
  const body = await res.json().catch(() => ({}));
  throw new Error(body.error || body.message || fallback);
}
