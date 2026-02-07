import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

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
      console.log("Uploadthing middleware started");
      const user = await getCurrentUser();

      if (!user) {
        console.error("Uploadthing middleware: Unauthorized");
        throw new UploadThingError("Unauthorized");
      }
      console.log("Uploadthing middleware: User authorized", user.id);

      return {
        userId: user.id,
        companyId: user.companyId,
        folderId: null, // Hardcoded for simplified debug
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Uploadthing onUploadComplete started");
      console.log("File uploaded:", file.name, file.url);

      try {
        const existing = await prisma.file.findFirst({ where: { key: file.key } });
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
        console.log("File metadata saved to DB successfully on server");
      } catch (e) {
        console.error("Failed to save file metadata on server:", e);
      }

      console.log("Uploadthing onUploadComplete finished");
      return { uploadedBy: metadata.userId, url: file.url };
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
      z.object({ tableId: z.preprocess((val) => Number(val), z.number()) }),
    )
    .middleware(async ({ req, input }) => {
      const user = await getCurrentUser();
      if (!user) throw new UploadThingError("Unauthorized");
      return {
        userId: user.id,
        companyId: user.companyId,
        tableId: input.tableId,
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Import file uploaded:", file.key);
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
            summary: null,
          },
        });
        return { importJobId: job.id };
      } catch (e) {
        console.error("Failed to create import job:", e);
        // We can't easily throw here to client, but client will see missing job id
        return { importJobId: null };
      }
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
