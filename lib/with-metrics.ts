import { httpRequestsTotal, httpRequestDuration } from "@/lib/metrics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (request: any, context?: any) => Promise<Response>;

/**
 * Wraps a Next.js route handler to record Prometheus metrics
 * (request count and duration histogram).
 */
export function withMetrics<T extends RouteHandler>(route: string, handler: T): T {
  return (async (request: any, context: any) => {
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
  }) as T;
}
