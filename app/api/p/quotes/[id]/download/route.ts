import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderToStream } from "@react-pdf/renderer";
import QuotePdfTemplate from "@/components/pdf/QuotePdfTemplate";
import React from "react";
import { registerFonts } from "@/lib/pdf-fonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  registerFonts();

  const resolvedParams = await params;

  const quote = await prisma.quote.findUnique({
    where: { id: resolvedParams.id },
    include: {
      client: true,
      items: {
        include: {
          product: true,
        },
      },
      company: true,
    },
  });

  if (!quote) {
    return new NextResponse("Quote not found", { status: 404 });
  }

  const filename = `quote-${quote.id.slice(-6)}.pdf`;
  const cachedUrl = (quote as any).pdfUrl;

  // 1. Check for Cached URL (same PDF the owner downloaded)
  if (cachedUrl) {
    try {
      const cachedRes = await fetch(cachedUrl);
      if (cachedRes.ok) {
        const blob = await cachedRes.blob();
        return new NextResponse(blob, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }
    } catch (error) {
      console.error("Error fetching cached PDF:", error);
    }
  }

  try {
    // 2. Generate PDF using the same template as the internal route
    const stream = await renderToStream(
      React.createElement(QuotePdfTemplate, { quote }),
    );

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("PDF Generation Error:", error);
    return new NextResponse(`Failed to generate PDF: ${error.message}`, {
      status: 500,
    });
  }
}
