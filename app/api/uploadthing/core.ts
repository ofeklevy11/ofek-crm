import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag, canWriteTable } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("Uploadthing");

const MAX_FILES_PER_COMPANY = 5000;

const f = createUploadthing();

export const ourFileRouter = {
  companyFiles: f(
    {
      image: { maxFileSize: "8MB", maxFileCount: 10 },
      pdf: { maxFileSize: "8MB", maxFileCount: 10 },
      text: { maxFileSize: "8MB", maxFileCount: 10 },
      audio: { maxFileSize: "8MB", maxFileCount: 10 },
    },
    {
      awaitServerData: false, // Client gets response immediately without waiting for onUploadComplete
    },
  )
    // .input(z.object({ folderId: z.number().nullable() }))
    .middleware(async ({ req }) => {
      const user = await getCurrentUser();

      if (!user) {
        log.error("Middleware unauthorized");
        throw new UploadThingError("Unauthorized");
      }
      if (!hasUserFlag(user, "canViewFiles")) {
        throw new UploadThingError("Forbidden");
      }

      const limited = await checkActionRateLimit(
        String(user.id),
        RATE_LIMITS.fileMutation,
      ).catch(() => true);
      if (limited) throw new UploadThingError("Rate limit exceeded");

      return {
        userId: user.id,
        companyId: user.companyId,
        folderId: null, // Hardcoded for simplified debug
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      try {
        // Enforce file count cap + dedup check in parallel
        const [fileCount, existing] = await Promise.all([
          prisma.file.count({
            where: { companyId: metadata.companyId },
          }),
          prisma.file.findFirst({
            where: { key: file.key, companyId: metadata.companyId },
            select: { id: true },
          }),
        ]);
        if (fileCount >= MAX_FILES_PER_COMPANY) {
          log.warn("File limit reached for company", { companyId: metadata.companyId });
          return { uploadedBy: metadata.userId };
        }

        if (!existing) {
          await prisma.file.create({
            data: {
              name: file.name,
              url: file.url,
              key: file.key,
              size: file.size,
              type: file.type || "unknown",
              folderId: metadata.folderId,
              companyId: metadata.companyId,
            },
          });
        }
      } catch (e) {
        log.error("Failed to save file metadata on server", { error: String(e) });
      }

      return { uploadedBy: metadata.userId };
    }),

  tableImport: f(
    {
      "text/csv": { maxFileSize: "32MB" },
      "text/plain": { maxFileSize: "32MB" },
      "application/vnd.ms-excel": { maxFileSize: "32MB" },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        maxFileSize: "32MB",
      },
    },
    { awaitServerData: false },
  ) // Client doesn't wait for server callback
    .input(
      z.object({ tableId: z.preprocess((val) => Number(val), z.number()) }) as any,
    )
    .middleware(async ({ req, input }) => {
      const user = await getCurrentUser();
      if (!user) throw new UploadThingError("Unauthorized");

      const limited = await checkActionRateLimit(
        String(user.id),
        RATE_LIMITS.fileMutation,
      ).catch(() => true);
      if (limited) throw new UploadThingError("Rate limit exceeded");

      const typedInput = input as { tableId: number };

      // Verify table exists in user's company and user has write access
      const table = await prisma.tableMeta.findFirst({
        where: { id: typedInput.tableId, companyId: user.companyId },
        select: { id: true },
      });
      if (!table) throw new UploadThingError("Table not found");
      if (!canWriteTable(user, typedInput.tableId))
        throw new UploadThingError("Forbidden");

      return {
        userId: user.id,
        companyId: user.companyId,
        tableId: typedInput.tableId,
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      try {
        const job = await prisma.importJob.create({
          data: {
            companyId: metadata.companyId,
            userId: metadata.userId,
            tableId: metadata.tableId,
            fileKey: file.key,
            fileUrl: file.url,
            originalName: file.name,
            status: "UPLOADED",
            summary: undefined,
          },
        });
        return { importJobId: job.id };
      } catch (e) {
        log.error("Failed to create import job", { error: String(e) });
        // We can't easily throw here to client, but client will see missing job id
        return { importJobId: null };
      }
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
