import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Endpoint removed for security reasons" },
    { status: 404 }
  );
}
