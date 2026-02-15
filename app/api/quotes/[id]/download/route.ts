import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { inngest } from "@/lib/inngest/client";

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

  const quote = await prisma.quote.findUnique({
    where: { id: resolvedParams.id, companyId: user.companyId },
    select: { id: true, pdfUrl: true, quoteNumber: true, updatedAt: true, companyId: true },
  });

  if (!quote) {
    return new NextResponse("Quote not found", { status: 404 });
  }

  const filename = `quote-${quote.id.slice(-6)}.pdf`;

  // Serve cached PDF if available
  if (quote.pdfUrl) {
    try {
      const cachedRes = await fetch(quote.pdfUrl, {
        signal: AbortSignal.timeout(8000),
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
          }).catch((err) => console.error("[download] Regenerate after stale URL:", err));
          return NextResponse.json(
            { status: "generating", message: "PDF is being regenerated" },
            { status: 202 },
          );
        }
        const blob = await cachedRes.blob();
        return new NextResponse(blob, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
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
        }).catch((err) => console.error("[download] Regenerate after 404:", err));
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

  // No cached PDF — the background job was already triggered on create/update.
  const ageMs = Date.now() - new Date(quote.updatedAt).getTime();

  // Beyond 5min, the PDF job likely failed — tell the user to re-save
  if (ageMs > 300_000) {
    return NextResponse.json(
      { status: "failed", message: "יצירת ה-PDF נכשלה. יש לערוך ולשמור מחדש את ההצעה כדי ליצור PDF חדש." },
      { status: 422 },
    );
  }

  // Recovery: if quote was updated between 60s and 5min ago, re-trigger once.
  if (ageMs > 60_000) {
    inngest.send({
      name: "pdf/generate-quote",
      data: { quoteId: quote.id, companyId: quote.companyId },
    }).catch((err) => console.error("[download] Recovery PDF trigger failed:", err));
  }

  return NextResponse.json(
    { status: "generating", message: "PDF is being generated in the background" },
    { status: 202 },
  );
}
