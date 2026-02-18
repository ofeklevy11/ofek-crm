import { NextResponse } from "next/server";
import { findApiKeyByValue } from "@/lib/api-key-utils";
import { createLogger } from "@/lib/logger";
import { createHmac, timingSafeEqual } from "crypto";

const log = createLogger("MakeAuth");

/**
 * Extract API key from a Make.com request.
 * Checks (in order):
 *   1. x-company-api-key header
 *   2. Authorization: Bearer <key> header
 *   3. apiKey query parameter
 *   4. Body parameter (passed explicitly by RPC handlers)
 */
export function extractMakeApiKey(req: Request, bodyApiKey?: string | null): string | null {
  const url = new URL(req.url);

  const customHeader = req.headers.get("x-company-api-key");
  const authHeader = req.headers.get("authorization");
  const queryKey = url.searchParams.get("apiKey");

  // 1. Custom header (primary)
  if (customHeader && customHeader !== "null") return customHeader;

  // 2. Authorization: Bearer
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1] && match[1] !== "null") return match[1];
  }

  // 3. Query parameter fallback
  if (queryKey && queryKey !== "null") return queryKey;

  // 4. Body parameter (for Make.com RPCs that pass connection params in body)
  if (bodyApiKey && bodyApiKey !== "null") return bodyApiKey;

  return null;
}

type KeyRecord = { companyId: number; isActive: boolean; createdBy: number };

type ValidateResult =
  | { success: true; keyRecord: KeyRecord }
  | { success: false; response: NextResponse };

/**
 * Extract and validate a Make API key in one call.
 * Returns the key record on success, or a 401 response on failure.
 */
export async function validateMakeApiKey(
  req: Request,
  bodyApiKey?: string | null,
): Promise<ValidateResult> {
  const apiKey = extractMakeApiKey(req, bodyApiKey);

  if (!apiKey) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Unauthorized: Missing API key" },
        { status: 401 },
      ),
    };
  }

  const keyRecord = await findApiKeyByValue(apiKey);
  if (!keyRecord || !keyRecord.isActive) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Unauthorized: Invalid or inactive API key" },
        { status: 401 },
      ),
    };
  }

  return { success: true, keyRecord };
}

// --- RPC token auth (for Make.com RPCs where connection.apiKey doesn't resolve) ---

const RPC_SECRET = process.env.SESSION_SECRET + "_make_rpc";

/** Generate a signed RPC token for a company. Token format: companyId.signature */
export function generateRpcToken(companyId: number): string {
  const data = String(companyId);
  const signature = createHmac("sha256", RPC_SECRET).update(data).digest("hex");
  return `${data}.${signature}`;
}

/** Verify an RPC token and return the companyId, or null if invalid. */
export function verifyRpcToken(token: string): number | null {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return null;

  const companyIdStr = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);
  if (!companyIdStr || !signature) return null;

  const companyId = parseInt(companyIdStr, 10);
  if (isNaN(companyId)) return null;

  const expected = createHmac("sha256", RPC_SECRET).update(companyIdStr).digest("hex");
  const sigBuf = Buffer.from(signature, "utf-8");
  const expectedBuf = Buffer.from(expected, "utf-8");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

  return companyId;
}
