// NOTE: Before this route works in production, run on VPS:
//   npx prisma db push --schema=prisma/schema.prisma
// This creates the OfficeLayout table in the VS database.

import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";
import { z } from "zod";

export const dynamic = "force-dynamic";

const FurniturePlacementSchema = z.object({
  singleId: z.number().int().min(1),
  x: z.number(),
  y: z.number(),
  flipX: z.boolean().optional(),
});

const AnchorPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const OfficeLayoutBodySchema = z.object({
  name: z.string().min(1).max(100),
  floor: z.array(z.array(z.number())),
  walls: z.array(z.array(z.number())),
  furniture: z.array(FurniturePlacementSchema),
  deskAnchors: z.array(AnchorPointSchema).default([]),
  loungeAnchors: z.array(AnchorPointSchema).default([]),
});

// POST /api/admin/office-layout — save (upsert) office layout (owner-only)
export async function POST(request: Request) {
  try {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const owner = _gate.user;
    const body = await request.json();
    const parsed = OfficeLayoutBodySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid layout data", details: parsed.error.flatten() }, { status: 400 });
    }

    const { name, floor, walls, furniture, deskAnchors, loungeAnchors } = parsed.data;

    await prisma.officeLayout.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        name,
        data: { floor, walls, furniture, deskAnchors, loungeAnchors },
        updatedBy: owner.email ?? owner.id,
      },
      update: {
        name,
        data: { floor, walls, furniture, deskAnchors, loungeAnchors },
        updatedBy: owner.email ?? owner.id,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("POST /api/admin/office-layout error:", error);
    return Response.json({ error: "Failed to save layout" }, { status: 500 });
  }
}
