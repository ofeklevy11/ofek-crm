import { httpRequestsTotal, httpRequestDuration } from "@/lib/metrics";

type RouteHandler = (
  request: Request,
  context?: unknown,
) => Promise<Response>;

/**
 * Wraps a Next.js route handler to record Prometheus metrics
 * (request count and duration histogram).
 */
export function withMetrics(route: string, handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    const start = performance.now();
    let statusCode = 500;
    try {
      const response = await handler(request, context);
      statusCode = response.status;
      return response;
    } finally {
      const duration = (performance.now() - start) / 1000;
      const labels = {
        method: request.method,
        route,
        status_code: String(statusCode),
      };
      httpRequestsTotal.inc(labels);
      httpRequestDuration.observe(labels, duration);
    }
  };
}
