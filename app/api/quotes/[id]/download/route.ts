import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { inngest } from "@/lib/inngest/client";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isSafeStorageUrl } from "@/lib/security/safe-hosts";
import { withRetry } from "@/lib/db-retry";
import { createLogger } from "@/lib/logger";

const log = createLogger("QuoteDownload");

const CUID_RE = /^c[a-z0-9]{24,}$/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (!hasUserFlag(user, "canViewQuotes")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!CUID_RE.test(resolvedParams.id)) {
    return new NextResponse("Invalid quote ID", { status: 400 });
  }

  const rateLimited = await checkRateLimit(String(user.id), RATE_LIMITS.quoteRead);
  if (rateLimited) return rateLimited;

  const quote = await withRetry(() => prisma.quote.findUnique({
    where: { id: resolvedParams.id, companyId: user.companyId },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, price: true, cost: true, sku: true },
          },
        },
      },
      company: {
        select: {
          name: true,
          businessType: true,
          taxId: true,
          businessAddress: true,
          businessEmail: true,
          businessWebsite: true,
          logoUrl: true,
        },
      },
    },
  }));

  if (!quote) {
    return new NextResponse("Quote not found", { status: 404 });
  }

  const filename = `quote-${quote.id.slice(-6)}.pdf`;

  // Serve cached PDF if available
  if (quote.pdfUrl) {
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
          // Storage returned non-PDF content — URL is stale, clear it and regenerate
          await prisma.quote.updateMany({
            where: { id: quote.id, companyId: user.companyId, pdfUrl: quote.pdfUrl },
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
            "Cache-Control": "private, no-store",
          },
        });
      }
      // Only clear pdfUrl if file is genuinely gone (404). On 5xx, don't nuke a valid URL.
      if (cachedRes.status === 404) {
        await prisma.quote.updateMany({
          where: { id: quote.id, companyId: user.companyId, pdfUrl: quote.pdfUrl },
          data: { pdfUrl: null },
        });
        // Trigger regeneration immediately
        inngest.send({
          name: "pdf/generate-quote",
          data: { quoteId: quote.id, companyId: quote.companyId },
        }).catch((err) => log.error("Regenerate after 404", { error: String(err) }));
      } else {
        return NextResponse.json(
          { status: "error", message: "PDF storage temporarily unavailable" },
          { status: 502 },
        );
      }
    } catch {
      // Fetch failed or timed out — don't clear URL, it may still be valid
      return NextResponse.json(
        { status: "error", message: "PDF storage temporarily unavailable" },
        { status: 502 },
      );
    }
  }

  // No cached PDF — render inline so the user gets it immediately
  try {
    const serializedQuote = JSON.parse(JSON.stringify(quote));

    const { registerFonts } = await import("@/lib/pdf-fonts");
    const { renderToStream } = await import("@react-pdf/renderer");
    const React = await import("react");
    const { default: QuotePdfTemplate } = await import(
      "@/components/pdf/QuotePdfTemplate"
    );

    registerFonts();

    const stream = await renderToStream(
      React.createElement(QuotePdfTemplate, { quote: serializedQuote }) as any,
    );

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    // Trigger background job to cache the PDF for future downloads (fire-and-forget)
    inngest.send({
      name: "pdf/generate-quote",
      data: { quoteId: quote.id, companyId: quote.companyId },
    }).catch((err) => log.error("Background cache trigger failed", { error: String(err) }));

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    log.error("Inline PDF render failed", { error: String(err) });

    // Fallback: return 202 and let the background job handle it
    inngest.send({
      name: "pdf/generate-quote",
      data: { quoteId: quote.id, companyId: quote.companyId },
    }).catch((e) => log.error("Fallback PDF trigger failed", { error: String(e) }));

    return NextResponse.json(
      { status: "generating", message: "PDF is being generated in the background" },
      { status: 202 },
    );
  }
}
