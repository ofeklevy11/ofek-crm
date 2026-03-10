/**
 * Centralized environment variable validation.
 * Import this module early (e.g., in instrumentation.ts or layout.tsx)
 * to fail fast on missing required configuration.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`FATAL: Required environment variable ${name} is not set.`);
  }
  return value;
}

function requireEnvMinLength(name: string, minLength: number): string {
  const value = requireEnv(name);
  if (value.length < minLength) {
    throw new Error(
      `FATAL: ${name} must be at least ${minLength} characters (got ${value.length}).`,
    );
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

/** Validated environment config — import this instead of reading process.env directly. */
export const env = {
  DATABASE_URL: requireEnv("DATABASE_URL"),
  REDIS_URL: requireEnv("REDIS_URL"),
  SESSION_SECRET: requireEnvMinLength("SESSION_SECRET", 32),
  CRON_SECRET: requireEnv("CRON_SECRET"),

  UPLOADTHING_TOKEN: requireEnv("UPLOADTHING_TOKEN"),
  OPENROUTER_API_KEY: optionalEnv("OPENROUTER_API_KEY"),
  PDFMONKEY_API_KEY: optionalEnv("PDFMONKEY_API_KEY"),
  RESEND_API_KEY: optionalEnv("RESEND_API_KEY"),
  INNGEST_EVENT_KEY: optionalEnv("INNGEST_EVENT_KEY"),
  INNGEST_SIGNING_KEY: optionalEnv("INNGEST_SIGNING_KEY"),
  WHATSAPP_ACCESS_TOKEN: optionalEnv("WHATSAPP_ACCESS_TOKEN"),
  WHATSAPP_TOKEN_ENCRYPTION_KEY: optionalEnv("WHATSAPP_TOKEN_ENCRYPTION_KEY"),
  NEXT_PUBLIC_APP_URL:
    process.env.NODE_ENV === "production"
      ? requireEnv("NEXT_PUBLIC_APP_URL")
      : optionalEnv("NEXT_PUBLIC_APP_URL"),
  GOOGLE_CLIENT_ID: optionalEnv("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: optionalEnv("GOOGLE_CLIENT_SECRET"),
  GOOGLE_TOKEN_ENCRYPTION_KEY: optionalEnv("GOOGLE_TOKEN_ENCRYPTION_KEY"),
  TWILIO_TOKEN_ENCRYPTION_KEY: optionalEnv("TWILIO_TOKEN_ENCRYPTION_KEY"),
  NODE_ENV: process.env.NODE_ENV || "development",
} as const;
