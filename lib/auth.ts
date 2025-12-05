import { createHmac } from "crypto";

const SECRET = process.env.SESSION_SECRET || "default-dev-secret-change-me";

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
  if (signature === expectedSignature) {
    return parseInt(data, 10);
  }
  return null;
}
