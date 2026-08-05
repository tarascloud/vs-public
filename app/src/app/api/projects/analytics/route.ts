import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UpdateGa4Schema = z.object({
  projectId: z.string().min(1),
  ga4MeasurementId: z.string().regex(/^G-[A-Z0-9]+$/, "Invalid GA4 format (expected G-XXXXXXX)").or(z.literal("")),
});

export async function GET() {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const owner = _gate.user;
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, url: true, ga4MeasurementId: true },
    orderBy: { name: "asc" },
  });

  return Response.json(projects);
}

export async function PUT(request: Request) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const owner = _gate.user;
  const body = await request.json();
  const parsed = UpdateGa4Schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, ga4MeasurementId } = parsed.data;

  const project = await prisma.project.update({
    where: { id: projectId },
    data: { ga4MeasurementId: ga4MeasurementId || null },
    select: { id: true, name: true, url: true, ga4MeasurementId: true },
  });

  return Response.json(project);
}
