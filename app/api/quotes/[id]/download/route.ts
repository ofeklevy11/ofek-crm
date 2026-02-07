import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { renderToStream } from "@react-pdf/renderer";
import QuotePdfTemplate from "@/components/pdf/QuotePdfTemplate";
import React from "react";
import { UTApi } from "uploadthing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const utapi = new UTApi();

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

  const filename = `quote-${quote.id.slice(-6)}.pdf`;
  const cachedUrl = (quote as any).pdfUrl;

  // 1. Check for Cached URL
  if (cachedUrl) {
    try {
      console.log("Serving cached PDF from:", cachedUrl);
      const cachedRes = await fetch(cachedUrl);
      if (cachedRes.ok) {
        const blob = await cachedRes.blob();
        return new NextResponse(blob, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      } else {
        console.warn("Cached PDF not found, regenerating...");
      }
    } catch (error) {
      console.error("Error fetching cached PDF:", error);
    }
  }

  try {
    // 2. Generate PDF Locally
    const stream = await renderToStream(
      React.createElement(QuotePdfTemplate, { quote }),
    );

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    // 3. Upload to UploadThing (Cache it)
    try {
      // Create a File object from the buffer
      const file = new File([pdfBuffer], filename, { type: "application/pdf" });

      const uploadRes = await utapi.uploadFiles([file]);

      if (uploadRes[0]?.data?.url) {
        const newUrl = uploadRes[0].data.url;
        console.log("PDF cached successfully:", newUrl);

        // Save to DB
        await prisma.quote.update({
          where: { id: quote.id },
          data: { pdfUrl: newUrl } as any, // Cast to any until migration runs
        });
      } else {
        console.error("Failed to upload PDF for caching:", uploadRes[0]?.error);
      }
    } catch (uploadError) {
      console.error("Error during PDF upload/caching:", uploadError);
      // We continue to return the generated PDF even if caching fails
    }

    // 4. Return the new PDF
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
