import { NextResponse } from "next/server";
import { findApiKeyByValue } from "@/lib/api-key-utils";
import { createLogger } from "@/lib/logger";

const log = createLogger("MakeAuth");

/**
 * Extract API key from a Make.com request.
 * Checks (in order):
 *   1. x-company-api-key header
 *   2. Authorization: Bearer <key> header
 *   3. apiKey query parameter
 */
export function extractMakeApiKey(req: Request): string | null {
  const url = new URL(req.url);

  // 1. Custom header (primary)
  const customHeader = req.headers.get("x-company-api-key");
  if (customHeader && customHeader !== "null") return customHeader;

  // 2. Authorization: Bearer
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1] && match[1] !== "null") return match[1];
  }

  // 3. Query parameter fallback
  const queryKey = url.searchParams.get("apiKey");
  if (queryKey && queryKey !== "null") return queryKey;

  log.warn("No API key found in request", {
    path: url.pathname,
    headerNames: Array.from(req.headers.keys()),
  });

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
export async function validateMakeApiKey(req: Request): Promise<ValidateResult> {
  const apiKey = extractMakeApiKey(req);

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
