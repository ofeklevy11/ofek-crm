import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canWriteTable } from "@/lib/permissions";
import { processImportFile } from "@/lib/import-service";
import { buildUploadThingUrl } from "@/lib/uploadthing-utils";
import { createLogger } from "@/lib/logger";

import { redis } from "@/lib/redis";

const log = createLogger("ImportValidate");

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
    }

    // Rate Limiting
    const rateLimitKey = `import_validate_limit:${user.id}`;
    const recentRequests = await redis.incr(rateLimitKey);
    if (recentRequests === 1) {
      await redis.expire(rateLimitKey, 60); // 1 minute window
    }

    if (recentRequests > 10) {
      // Allow slightly more validates than commits as users might retry
      return NextResponse.json(
        { error: "יותר מדי ניסיונות בדיקה. אנא המתן דקה." },
        { status: 429 },
      );
    }

    const tableId = parseInt(id, 10);
    if (!Number.isFinite(tableId) || tableId < 1) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }
    if (!canWriteTable(user, tableId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    // SECURITY: Only accept fileKey from client, never fileUrl
    // URL is constructed server-side to prevent SSRF attacks
    let { importJobId, fileKey, fileName, fileSize } = body;
    let job: any = null;

    if (importJobId) {
      // 1. Get Job by ID — scoped by companyId
      job = await prisma.importJob.findFirst({
        where: { id: importJobId, companyId: user.companyId },
      });
    } else if (fileKey) {
      // 1a. Create Job on the fly (Robust mode)
      // Validate and build secure URL from fileKey
      const secureFileUrl = buildUploadThingUrl(fileKey);

      job = await prisma.importJob.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          tableId: tableId,
          fileKey: fileKey,
          fileUrl: secureFileUrl, // Server-constructed URL only
          originalName: fileName || "unknown.csv",
          status: "UPLOADED",
          summary: null,
        },
      });
      // We set importJobId so response can send it back if needed (or we stick to just returning summary)
      importJobId = job.id;
    } else {
      return NextResponse.json(
        { error: "Missing importJobId or fileKey" },
        { status: 400 },
      );
    }

    if (!job || job.tableId !== tableId || job.companyId !== user.companyId) {
      return NextResponse.json(
        { error: "Job not found or access denied" },
        { status: 404 },
      );
    }

    // Return the job ID in the headers or body if we created it?
    // The client expects summary. Let's append jobId to summary or rely on client knowing it?
    // The client needs the ID for the commit step.
    // We will inject `importJobId` into the returned JSON summary so client can update state.

    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId },
    });

    if (!table) {
      return NextResponse.json({ error: "הטבלה לא נמצאה" }, { status: 404 });
    }

    // Update status
    await prisma.importJob.update({
      where: { id: job.id, companyId: user.companyId },
      data: { status: "VALIDATING" },
    });

    // 2. Fetch File Stream
    // SECURITY: Build URL from fileKey, never use stored fileUrl directly
    // This prevents SSRF even if old malicious URLs exist in DB
    const secureUrl = buildUploadThingUrl(job.fileKey);
    log.debug("Fetching file from secure URL");
    const fileRes = await fetch(secureUrl, {
      signal: AbortSignal.timeout(30_000), // P215: 30s timeout matching import job
    });
    if (!fileRes.ok || !fileRes.body) {
      throw new Error("Failed to download file from storage");
    }

    // 3. Get Schema
    let schema: any[] = [];
    try {
      if (typeof table.schemaJson === "string") {
        schema = JSON.parse(table.schemaJson);
      } else {
        schema = (table.schemaJson as any[]) || [];
      }
    } catch (e) {
      log.error("Schema parse error", { error: String(e) });
      return NextResponse.json(
        { error: "מבנה הטבלה אינו תקין" },
        { status: 500 },
      );
    }

    // 4. Process (Dry Run)
    // We pass the web stream directly
    const result = await processImportFile(fileRes.body, schema, true);

    // 5. Check Headers & Extra Columns
    const schemaFields = schema.map((f) => f.name);

    if (result.summary.headers.length === 0) {
      await prisma.importJob.update({
        where: { id: job.id, companyId: user.companyId },
        data: { status: "FAILED", summary: result.summary as any },
      });
      return NextResponse.json(
        {
          error: `לא זוהתה שורת כותרת תקינה בקובץ.
אנא וודא שהקובץ אינו ריק, שהוא בקידוד UTF-8, וששורת הכותרת מכילה את השמות הבאים:
${schemaFields.join(", ")}`,
        },
        { status: 400 },
      );
    }
    const fileHeaders = result.summary.headers;

    const systemColumns = [
      "id",
      "created at",
      "created by",
      "updated at",
      "updated by",
    ];
    const extra = fileHeaders.filter((h) => {
      const lowerH = h.toLowerCase();
      return !schemaFields.includes(h) && !systemColumns.includes(lowerH);
    });

    if (extra.length > 0) {
      await prisma.importJob.update({
        where: { id: job.id, companyId: user.companyId },
        data: { status: "FAILED", summary: result.summary as any },
      });
      return NextResponse.json(
        {
          error: `קובץ לא תקין: עמודות מיותרות בקובץ: ${extra.join(", ")}`,
          details: extra,
        },
        { status: 400 },
      );
    }

    const missing = schemaFields.filter((f) => !fileHeaders.includes(f));
    if (missing.length > 0) {
      await prisma.importJob.update({
        where: { id: job.id, companyId: user.companyId },
        data: { status: "FAILED", summary: result.summary as any },
      });
      return NextResponse.json(
        {
          error: `קובץ לא תקין: עמודות חסרות בקובץ: ${missing.join(", ")}`,
          details: missing,
        },
        { status: 400 },
      );
    }

    // Success
    await prisma.importJob.update({
      where: { id: job.id, companyId: user.companyId },
      data: { status: "VALIDATED", summary: result.summary as any },
    });

    return NextResponse.json({ ...result.summary, importJobId });
  } catch (err: any) {
    log.error("Import validate error", { error: String(err) });
    return NextResponse.json(
      { error: "שגיאת שרת פנימית" },
      { status: 500 },
    );
  }
}
