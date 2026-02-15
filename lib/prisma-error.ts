import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * Maps common Prisma error codes to HTTP status codes and user-friendly messages.
 * Use in API route catch blocks for consistent error responses.
 */
export function handlePrismaError(
  error: unknown,
  context: string,
): NextResponse {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2025":
        return NextResponse.json(
          { error: `${context} not found` },
          { status: 404 },
        );
      case "P2002": {
        const target = (error.meta?.target as string[])?.join(", ") ?? "field";
        return NextResponse.json(
          { error: `A ${context} with this ${target} already exists` },
          { status: 409 },
        );
      }
      case "P2003":
        return NextResponse.json(
          { error: `Cannot delete ${context} — it has related records` },
          { status: 400 },
        );
    }
  }

  console.error(`Error in ${context}:`, error);
  return NextResponse.json(
    { error: `Failed to process ${context}` },
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
