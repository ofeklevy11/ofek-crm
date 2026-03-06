type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "secret",
  "apikey",
  "authorization",
  "cookie",
  "creditcard",
  "ssn",
  "cvv",
  "sessionsecret",
  "keyhash",
  "fullkey",
  "passwordhash",
]);

const isProd = process.env.NODE_ENV === "production";
const configuredLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ?? (isProd ? "info" : "debug");

/** Strip newlines and control chars to prevent log injection. */
function sanitize(val: string): string {
  // eslint-disable-next-line no-control-regex
  return val.replace(/[\x00-\x1f\x7f]/g, "");
}

/** Deep-redact sensitive fields and sanitize strings. */
function redact(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return sanitize(obj);
  if (typeof obj !== "object") return obj;

  if (obj instanceof Error) {
    return { message: sanitize(obj.message), stack: obj.stack ? sanitize(obj.stack) : undefined };
  }

  if (Array.isArray(obj)) return obj.map(redact);

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = redact(val);
    }
  }
  return out;
}

export interface LogContext {
  requestId?: string;
  route?: string;
  statusCode?: number;
  durationMs?: number;
}

function emit(level: LogLevel, module: string, message: string, data?: unknown, ctx?: LogContext) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel]) return;

  const safeMsg = sanitize(message);
  const safeData = data !== undefined ? redact(data) : undefined;

  if (isProd) {
    const entry: Record<string, unknown> = {
      level,
      module,
      msg: safeMsg,
      ts: new Date().toISOString(),
    };
    if (ctx?.requestId) entry.requestId = ctx.requestId;
    if (ctx?.route) entry.route = ctx.route;
    if (ctx?.statusCode !== undefined) entry.statusCode = ctx.statusCode;
    if (ctx?.durationMs !== undefined) entry.durationMs = ctx.durationMs;
    if (safeData !== undefined) entry.data = safeData;
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(JSON.stringify(entry));
  } else {
    const prefix = `[${level.toUpperCase()}] [${module}]`;
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    if (safeData !== undefined) {
      fn(prefix, safeMsg, safeData);
    } else {
      fn(prefix, safeMsg);
    }
  }
}

export function createLogger(module: string) {
  return {
    debug: (message: string, data?: unknown) => emit("debug", module, message, data),
    info: (message: string, data?: unknown) => emit("info", module, message, data),
    warn: (message: string, data?: unknown) => emit("warn", module, message, data),
    error: (message: string, data?: unknown) => emit("error", module, message, data),
    /** Returns a child logger with pre-bound context (requestId, route, etc.) */
    withContext(ctx: LogContext) {
      return {
        debug: (message: string, data?: unknown) => emit("debug", module, message, data, ctx),
        info: (message: string, data?: unknown) => emit("info", module, message, data, ctx),
        warn: (message: string, data?: unknown) => emit("warn", module, message, data, ctx),
        error: (message: string, data?: unknown) => emit("error", module, message, data, ctx),
      };
    },
  };
}
