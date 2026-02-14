import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.SESSION_SECRET || "default-dev-secret-change-me";

if (
  process.env.NODE_ENV === "production" &&
  SECRET === "default-dev-secret-change-me"
) {
  throw new Error(
    "FATAL: SESSION_SECRET environment variable is not set in production. Refusing to start with an insecure default secret."
  );
}

export function signUserId(userId: number): string {
  const data = userId.toString();
  const signature = createHmac("sha256", SECRET).update(data).digest("hex");
  return `${data}.${signature}`;
}

export function verifyUserId(token: string): number | null {
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expectedSignature = createHmac("sha256", SECRET)
    .update(data)
    .digest("hex");

  if (signature.length !== expectedSignature.length) return null;

  const sigBuf = Buffer.from(signature, "utf-8");
  const expectedBuf = Buffer.from(expectedSignature, "utf-8");
  if (timingSafeEqual(sigBuf, expectedBuf)) {
    return parseInt(data, 10);
  }
  return null;
}
