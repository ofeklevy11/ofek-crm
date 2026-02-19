import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("PrismaError");

/**
 * Maps common Prisma error codes to HTTP status codes and user-friendly messages.
 * Use in API route catch blocks for consistent error responses.
 */
export function handlePrismaError(
  error: unknown,
  context: string,
): NextResponse {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    log.error(`Prisma error ${error.code}`, { context, meta: error.meta });
    switch (error.code) {
      case "P2025":
        return NextResponse.json(
          { error: "הפריט המבוקש לא נמצא" },
          { status: 404 },
        );
      case "P2002": {
        return NextResponse.json(
          { error: "פריט עם פרטים אלו כבר קיים במערכת" },
          { status: 409 },
        );
      }
      case "P2003":
        return NextResponse.json(
          { error: "לא ניתן למחוק פריט זה כיוון שקיימים פריטים הקשורים אליו" },
          { status: 400 },
        );
    }
  }

  log.error("Unhandled Prisma error", { context, error: (error as Error).message ?? "Unknown error" });
  return NextResponse.json(
    { error: "אירעה שגיאה בעיבוד הבקשה. אנא נסו שוב" },
    { status: 500 },
  );
}

/**
 * Check if a Prisma error matches a specific code.
 * Useful in server actions where NextResponse isn't appropriate.
 */
export function isPrismaError(
  error: unknown,
  code: string,
): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}
