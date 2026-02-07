import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { renderToStream } from "@react-pdf/renderer";
import QuotePdfTemplate from "@/components/pdf/QuotePdfTemplate";
import React from "react";

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

  try {
    // Generate PDF Stream
    // Using createElement to avoid JSX syntax in .ts file
    const stream = await renderToStream(
      React.createElement(QuotePdfTemplate, { quote }),
    );

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="quote-${quote.id.slice(
          -6,
        )}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("PDF Generation Error:", error);
    return new NextResponse(`Failed to generate PDF: ${error.message}`, {
      status: 500,
    });
  }
}
