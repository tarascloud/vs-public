import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

const ALLOWED_SLUGS = ["4Andrii"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!ALLOWED_SLUGS.includes(slug)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const filePath = join(process.cwd(), "public", "proposals", `${slug}.html`);

  try {
    const html = await readFile(filePath, "utf-8");
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
