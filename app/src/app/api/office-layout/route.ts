// NOTE: Before this route works in production, run on VPS:
//   npx prisma db push --schema=prisma/schema.prisma
// This creates the OfficeLayout table in the VS database.

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/office-layout — returns saved layout (public).
// REV-20260512-080: differentiate "no saved layout" (404) from "lookup failed"
// (500). Both callers (studio canvas + admin editor) already gate on `r.ok`
// and fall back to DEFAULT_OFFICE_LAYOUT, so the contract is preserved while
// the error case stops being silently swallowed.
export async function GET() {
  let row;
  try {
    row = await prisma.officeLayout.findUnique({
      where: { id: "default" },
    });
  } catch (error) {
    console.error("GET /api/office-layout lookup failed:", error);
    return Response.json(
      { error: "office_layout_lookup_failed" },
      { status: 500 },
    );
  }

  if (!row) {
    return Response.json(
      { error: "office_layout_not_found" },
      { status: 404 },
    );
  }

  const data = row.data as {
    floor: number[][];
    walls: number[][];
    furniture: Array<{ singleId: number; x: number; y: number; flipX?: boolean }>;
    deskAnchors?: Array<{ x: number; y: number }>;
    loungeAnchors?: Array<{ x: number; y: number }>;
  };

  return Response.json({
    name: row.name,
    floor: data.floor,
    walls: data.walls,
    furniture: data.furniture,
    deskAnchors: data.deskAnchors ?? [],
    loungeAnchors: data.loungeAnchors ?? [],
    updatedAt: row.updatedAt,
  });
}
