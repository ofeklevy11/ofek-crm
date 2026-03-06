/**
 * Integration tests for PDF generation Inngest job.
 *
 * REAL: Prisma (test DB), company/quote/quoteItem seeding.
 * MOCKED: @/lib/inngest/client (handler capture), @/lib/pdf-fonts,
 *         @react-pdf/renderer, uploadthing/server, @/components/pdf/QuotePdfTemplate,
 *         @/lib/logger (global mock in tests/setup.ts).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Readable } from "stream";
import { createMockStep, createMockEvent } from "../helpers/inngest-test-utils";
import { prisma } from "@/lib/prisma";

// ── Handler capture ───────────────────────────────────────────────
const handlers: Record<string, Function> = {};
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn((config: any, _trigger: any, handler: any) => {
      handlers[config.id] = handler;
      return { fn: handler };
    }),
  },
}));

// ── Mock pdf-fonts ────────────────────────────────────────────────
vi.mock("@/lib/pdf-fonts", () => ({
  registerFonts: vi.fn(),
}));

// ── Mock @react-pdf/renderer ──────────────────────────────────────
vi.mock("@react-pdf/renderer", () => ({
  renderToStream: vi.fn().mockImplementation(async () => {
    const stream = new Readable({
      read() {
        this.push(Buffer.from("%PDF-1.4-fake-content"));
        this.push(null);
      },
    });
    return stream;
  }),
}));

// ── Mock QuotePdfTemplate ─────────────────────────────────────────
vi.mock("@/components/pdf/QuotePdfTemplate", () => ({
  default: () => null,
}));

// ── Mock uploadthing/server ───────────────────────────────────────
const MOCK_PDF_URL = "https://ufs.sh/f/test-upload-key-12345";
const mockUploadFiles = vi.fn().mockResolvedValue([
  {
    data: {
      ufsUrl: MOCK_PDF_URL,
      url: "https://utfs.io/f/test-upload-key-12345",
    },
    error: null,
  },
]);
const mockDeleteFiles = vi.fn().mockResolvedValue(undefined);

vi.mock("uploadthing/server", () => ({
  UTApi: class {
    uploadFiles = mockUploadFiles;
    deleteFiles = mockDeleteFiles;
  },
}));

// ── Test data ─────────────────────────────────────────────────────
let companyId: number;
let userId: number;
let quoteId: string;
let quoteItemId: number;

beforeAll(async () => {
  await import("@/lib/inngest/functions/pdf-jobs");

  const company = await prisma.company.create({
    data: {
      name: "PDF Test Co",
      slug: `pdf-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  companyId = company.id;

  const user = await prisma.user.create({
    data: {
      companyId,
      name: "PDF User",
      email: `pdf-user-${Date.now()}@test.com`,
      passwordHash: "not-a-real-hash",
    },
  });
  userId = user.id;

  const quote = await prisma.quote.create({
    data: {
      companyId,
      clientName: "Test Client",
      clientEmail: "client@test.com",
      total: 1500.0,
      status: "DRAFT",
      isTrashed: false,
    },
  });
  quoteId = quote.id;

  const quoteItem = await prisma.quoteItem.create({
    data: {
      quoteId,
      description: "Consulting Service",
      quantity: 3,
      unitPrice: 500.0,
    },
  });
  quoteItemId = quoteItem.id;
});

afterAll(async () => {
  await prisma.quoteItem.deleteMany({ where: { quoteId } });
  await prisma.quote.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

// ── generateQuotePdf ──────────────────────────────────────────────
describe("generateQuotePdf (generate-quote-pdf)", () => {
  it("fetches quote, renders PDF, uploads, and saves URL to DB", async () => {
    mockUploadFiles.mockClear();
    mockDeleteFiles.mockClear();

    const step = createMockStep();
    const event = createMockEvent("pdf/generate-quote", {
      quoteId,
      companyId,
      oldPdfUrl: undefined,
    });

    const result = await handlers["generate-quote-pdf"]({ event, step });

    expect(result).toEqual({
      quoteId,
      pdfUrl: MOCK_PDF_URL,
    });

    // Verify upload was called
    expect(mockUploadFiles).toHaveBeenCalledTimes(1);
    const uploadArg = mockUploadFiles.mock.calls[0][0];
    expect(uploadArg).toHaveLength(1);
    expect(uploadArg[0]).toBeInstanceOf(File);
    expect(uploadArg[0].name).toContain("quote-");
    expect(uploadArg[0].name).toMatch(/\.pdf$/);

    // Verify the URL was saved to the DB
    const updatedQuote = await prisma.quote.findUnique({ where: { id: quoteId } });
    expect(updatedQuote?.pdfUrl).toBe(MOCK_PDF_URL);
  });

  it("deletes old PDF when oldPdfUrl is provided", async () => {
    mockUploadFiles.mockClear();
    mockDeleteFiles.mockClear();

    const step = createMockStep();
    const event = createMockEvent("pdf/generate-quote", {
      quoteId,
      companyId,
      oldPdfUrl: "https://ufs.sh/f/old-file-key-xyz",
    });

    await handlers["generate-quote-pdf"]({ event, step });

    // Should delete the old file
    expect(mockDeleteFiles).toHaveBeenCalledTimes(1);
    expect(mockDeleteFiles).toHaveBeenCalledWith(["old-file-key-xyz"]);
  });

  it("throws when quote is not found", async () => {
    const step = createMockStep();
    const event = createMockEvent("pdf/generate-quote", {
      quoteId: "nonexistent-quote-id",
      companyId,
    });

    await expect(
      handlers["generate-quote-pdf"]({ event, step }),
    ).rejects.toThrow("not found or trashed");
  });

  it("throws when companyId does not match the quote", async () => {
    const step = createMockStep();
    const event = createMockEvent("pdf/generate-quote", {
      quoteId,
      companyId: 999999, // wrong company
    });

    await expect(
      handlers["generate-quote-pdf"]({ event, step }),
    ).rejects.toThrow("not found or trashed");
  });
});
