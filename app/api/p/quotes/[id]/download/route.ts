import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isSafeStorageUrl } from "@/lib/security/safe-hosts";
import crypto from "crypto";
import { createLogger } from "@/lib/logger";

const log = createLogger("PublicQuoteDownload");

const CUID_RE = /^c[a-z0-9]{24,}$/;

function tokensMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false; // Different lengths throw RangeError
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;

  if (!CUID_RE.test(resolvedParams.id)) {
    return new NextResponse("Invalid quote ID", { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimited = await checkRateLimit(ip, RATE_LIMITS.publicDownload);
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  const quote = await prisma.quote.findFirst({
    where: { id: resolvedParams.id, isTrashed: false },
    select: { id: true, pdfUrl: true, shareToken: true, companyId: true, updatedAt: true },
  });

  // Merge missing + wrong-token into a single 404 to prevent quote existence enumeration
  if (!quote || !tokensMatch(token, quote.shareToken)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // If no cached PDF, trigger generation recovery and show waiting page
  if (!quote.pdfUrl) {
    // Recovery: trigger PDF generation if quote was updated within 5 min (safe — debounce prevents dupes)
    const ageMs = Date.now() - new Date(quote.updatedAt).getTime();
    if (ageMs < 300_000) {
      inngest.send({
        name: "pdf/generate-quote",
        data: { quoteId: quote.id, companyId: quote.companyId },
      }).catch((err) => log.error("Recovery PDF trigger failed", { error: String(err) }));
    }

    const nonce = (await headers()).get("x-nonce") ?? "";

    return new NextResponse(
      `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>PDF בהכנה</title>
<style nonce="${nonce}">body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f8f8;color:#333}
.card{background:#fff;border-radius:16px;padding:2.5rem;max-width:400px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
h1{font-size:1.25rem;margin-bottom:.75rem}p{color:#666;font-size:.9rem;line-height:1.6}
button{margin-top:1.25rem;padding:.75rem 1.5rem;background:#4f95ff;color:#fff;border:none;border-radius:10px;font-size:.9rem;font-weight:600;cursor:pointer}
button:hover{background:#3d7de0}</style></head>
<body><div class="card"><h1>ה-PDF עדיין בהכנה</h1><p>המסמך נמצא בתהליך יצירה. הדף יתרענן אוטומטית בעוד מספר שניות.</p>
<button id="retry">נסה שוב</button></div><script nonce="${nonce}">document.getElementById("retry").addEventListener("click",function(){location.reload()})</script></body></html>`,
      {
        status: 202,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Retry-After": "5",
        },
      },
    );
  }

  const filename = `quote-${quote.id.slice(-6)}.pdf`;

  // SECURITY: Validate URL host before server-side fetch to prevent SSRF
  if (!isSafeStorageUrl(quote.pdfUrl)) {
    return NextResponse.json(
      { status: "error", message: "PDF storage error" },
      { status: 500 },
    );
  }

  try {
    const cachedRes = await fetch(quote.pdfUrl, {
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (cachedRes.ok) {
      // Validate that storage actually returned a PDF, not an HTML error/redirect page
      const ct = cachedRes.headers.get("content-type") ?? "";
      if (!ct.includes("application/pdf")) {
        // Stale URL — clear it and trigger regeneration
        await prisma.quote.updateMany({
          where: { id: quote.id, pdfUrl: quote.pdfUrl },
          data: { pdfUrl: null },
        });
        inngest.send({
          name: "pdf/generate-quote",
          data: { quoteId: quote.id, companyId: quote.companyId },
        }).catch((err) => log.error("Regenerate after stale URL", { error: String(err) }));
        return NextResponse.json(
          { status: "generating", message: "PDF is being regenerated" },
          { status: 202 },
        );
      }
      return new NextResponse(cachedRes.body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        },
      });
    }
    // 404 — file gone from storage, trigger regeneration
    if (cachedRes.status === 404) {
      await prisma.quote.updateMany({
        where: { id: quote.id, pdfUrl: quote.pdfUrl },
        data: { pdfUrl: null },
      });
      inngest.send({
        name: "pdf/generate-quote",
        data: { quoteId: quote.id, companyId: quote.companyId },
      }).catch((err) => log.error("Regenerate after 404", { error: String(err) }));
    }
  } catch {
    // Fetch failed or timed out
  }

  return NextResponse.json(
    { status: "not_ready", message: "PDF is temporarily unavailable" },
    { status: 502 },
  );
}
