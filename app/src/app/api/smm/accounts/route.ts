import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const CreateSmmAccountSchema = z.object({
  platform: z.enum(["youtube", "twitter", "instagram", "tiktok", "linkedin"]),
  accountName: z.string().min(1, "Account name is required"),
  accountUrl: z.string().url("Valid URL is required"),
  projectId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  // secrets: only key names stored, NOT values
  secretKeys: z.array(z.string()).optional(),
});

export async function GET() {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const owner = _gate.user;
  try {
    const accounts = await prisma.smmAccount.findMany({
      include: {
        project: { select: { id: true, name: true } },
        initiatives: {
          select: { id: true, title: true, rawIdea: true, status: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(accounts);
  } catch (error) {
    console.error("Failed to fetch SMM accounts:", error);
    return Response.json({ error: "Failed to fetch SMM accounts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const owner = _gate.user;
  try {
    const body = await request.json();
    const parsed = CreateSmmAccountSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { platform, accountName, accountUrl, projectId, description, avatarUrl, secretKeys } = parsed.data;

    // Store only key names in secrets JSON, never values
    const secrets: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =
      secretKeys && secretKeys.length > 0
        ? { keys: secretKeys.filter((k) => k.trim().length > 0) }
        : Prisma.JsonNull;

    const account = await prisma.smmAccount.create({
      data: {
        platform,
        accountName,
        accountUrl,
        projectId: projectId || null,
        description: description || null,
        avatarUrl: avatarUrl || null,
        secrets,
      },
      include: {
        project: { select: { id: true, name: true } },
        initiatives: {
          select: { id: true, title: true, rawIdea: true, status: true },
        },
      },
    });

    return Response.json(account, { status: 201 });
  } catch (error) {
    console.error("Failed to create SMM account:", error);
    return Response.json({ error: "Failed to create SMM account" }, { status: 500 });
  }
}
