export async function register() {
  // Validate required environment variables at startup
  await import("@/lib/env");

  // Initialize Prometheus metrics singleton (server-side only)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/metrics");
  }
}
