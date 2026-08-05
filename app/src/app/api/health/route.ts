import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUBLIC: Health check endpoint for monitoring (status.example.com, docker healthcheck).
// No auth required — returns only status, no sensitive data.

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "error", message: "DB connection failed" },
      { status: 503 }
    );
  }
}
