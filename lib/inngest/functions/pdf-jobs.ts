import { inngest } from "../client";

/**
 * Background job for generating quote PDFs.
 * Offloads CPU-intensive @react-pdf/renderer work from the request thread.
 * Uploads the result to UploadThing and caches the URL in the database.
 */
export const generateQuotePdf = inngest.createFunction(
  {
    id: "generate-quote-pdf",
    name: "Generate Quote PDF",
    retries: 2,
    timeouts: { finish: "45s" },
    concurrency: [
      { limit: 3, key: "event.data.companyId" },
      { limit: 10 }, // global cap to prevent OOM with many concurrent companies
    ],
    // BB14: 30s debounce — PDF render takes 10-30s, 5s was too short
    debounce: {
      key: "event.data.quoteId",
      period: "30s",
    },
  },
  { event: "pdf/generate-quote" },
  async ({ event, step }) => {
    const { quoteId, companyId, oldPdfUrl } = event.data;

    // Step 1: Fetch quote data (skip if trashed)
    const quote = await step.run("fetch-quote", async () => {
      const { prisma } = await import("@/lib/prisma");
      const q = await prisma.quote.findFirst({
        where: { id: quoteId, companyId, isTrashed: false },
        include: {
          items: { include: { product: true } },
          company: true,
        },
      });
      if (!q) throw new Error(`Quote ${quoteId} not found or trashed`);
      // Serialize Decimal fields for transfer between steps
      return JSON.parse(JSON.stringify(q));
    });

    // Step 2: Render PDF, upload new file, delete old file, and save URL
    const pdfUrl = await step.run("render-and-upload", async () => {
      const { registerFonts } = await import("@/lib/pdf-fonts");
      const { renderToStream } = await import("@react-pdf/renderer");
      const React = await import("react");
      const { default: QuotePdfTemplate } = await import(
        "@/components/pdf/QuotePdfTemplate"
      );
      const { UTApi } = await import("uploadthing/server");
      const { prisma } = await import("@/lib/prisma");

      // Render PDF
      registerFonts();

      const stream = await renderToStream(
        React.createElement(QuotePdfTemplate, { quote }) as any,
      );

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const pdfBuffer = Buffer.concat(chunks);

      // Upload new file FIRST (before deleting old one)
      const utapi = new UTApi();
      const filename = `quote-${quoteId.slice(-6)}.pdf`;
      const file = new File([pdfBuffer], filename, { type: "application/pdf" });

      const uploadRes = await utapi.uploadFiles([file]);

      const uploaded = uploadRes[0]?.data;
      if (!uploaded?.ufsUrl && !uploaded?.url) {
        throw new Error(
          `Upload failed: ${uploadRes[0]?.error?.message || "unknown"}`,
        );
      }

      // Use ufsUrl (new ufs.sh format) — data.url (utfs.io) is deprecated in v7
      const url = uploaded.ufsUrl ?? uploaded.url;

      // Save new URL — only if quote hasn't been trashed during generation
      const result = await prisma.quote.updateMany({
        where: { id: quoteId, companyId, isTrashed: false },
        data: { pdfUrl: url },
      });

      if (result.count === 0) {
        // Quote was trashed during generation — clean up uploaded file
        try {
          const fileKey = new URL(url).pathname.split("/").pop();
          if (fileKey) await utapi.deleteFiles([fileKey]);
        } catch (err) {
          console.error("[pdf-jobs] Failed to clean up orphaned upload:", err);
        }
        return null;
      }

      // Only NOW delete old file (new file is confirmed saved)
      if (oldPdfUrl) {
        try {
          const parsedUrl = new URL(oldPdfUrl);
          const fileKey = parsedUrl.pathname.split("/").pop();
          if (fileKey) {
            await utapi.deleteFiles([fileKey]);
          }
        } catch (err) {
          console.error("[pdf-jobs] Failed to delete old file:", err);
          // Non-critical — new file is already saved
        }
      }

      return url;
    });

    return { quoteId, pdfUrl };
  },
);
