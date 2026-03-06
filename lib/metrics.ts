import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

export const register = new Registry();

collectDefaultMetrics({ register, prefix: "nextjs_" });

// ── HTTP metrics ──

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ── Business / CRM metrics ──

export const inngestJobsTotal = new Counter({
  name: "crm_inngest_jobs_total",
  help: "Inngest jobs dispatched",
  labelNames: ["function_name", "status"] as const,
  registers: [register],
});

export const dbQueryDuration = new Histogram({
  name: "crm_db_query_duration_seconds",
  help: "Database query duration",
  labelNames: ["operation"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export const dbPoolActiveConnections = new Gauge({
  name: "crm_db_pool_active_connections",
  help: "Active database pool connections",
  registers: [register],
});
