import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

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
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  const quote = await prisma.quote.findFirst({
    where: { id: resolvedParams.id, isTrashed: false },
    select: { id: true, pdfUrl: true, shareToken: true },
  });

  if (!quote) {
    return new NextResponse("Quote not found", { status: 404 });
  }

  // Validate share token for public access (timing-safe).
  // Always require a valid token — tokensMatch returns false when either arg is null.
  if (!tokensMatch(token, quote.shareToken)) {
    return new NextResponse("Invalid or missing share token", { status: 403 });
  }

  // Public route only serves cached PDFs — never triggers generation
  if (!quote.pdfUrl) {
    return new NextResponse(
      `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>PDF בהכנה</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f8f8;color:#333}
.card{background:#fff;border-radius:16px;padding:2.5rem;max-width:400px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
h1{font-size:1.25rem;margin-bottom:.75rem}p{color:#666;font-size:.9rem;line-height:1.6}
button{margin-top:1.25rem;padding:.75rem 1.5rem;background:#4f95ff;color:#fff;border:none;border-radius:10px;font-size:.9rem;font-weight:600;cursor:pointer}
button:hover{background:#3d7de0}</style></head>
<body><div class="card"><h1>ה-PDF עדיין בהכנה</h1><p>המסמך נמצא בתהליך יצירה. הדף יתרענן אוטומטית בעוד מספר שניות.</p>
<button onclick="location.reload()">נסה שוב</button></div></body></html>`,
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

  try {
    const cachedRes = await fetch(quote.pdfUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (cachedRes.ok) {
      const blob = await cachedRes.blob();
      return new NextResponse(blob, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }
  } catch {
    // Fetch failed or timed out
  }

  return NextResponse.json(
    { status: "not_ready", message: "PDF is temporarily unavailable" },
    { status: 502 },
  );
}
