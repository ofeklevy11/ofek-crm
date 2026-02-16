export async function register() {
  // Validate required environment variables at startup
  await import("@/lib/env");
}
