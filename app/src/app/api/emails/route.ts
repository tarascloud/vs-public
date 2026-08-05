import { prisma } from "@/lib/prisma";
import { requireOwnerApi, verifyInternalSecret } from "@/lib/auth-helpers";
import type { EmailWhereInput } from "@/generated/prisma/models";

export const dynamic = "force-dynamic";

// GET /api/emails — list emails (OWNER only)
export async function GET(request: Request) {
  try {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const where: EmailWhereInput = { deleted: false };
    if (category) {
      where.category = category;
    }
    if (unreadOnly) {
      where.read = false;
    }

    const emails = await prisma.email.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return Response.json(emails);
  } catch (error) {
    console.error("GET /api/emails error:", error);
    return Response.json({ error: "Failed to fetch emails" }, { status: 500 });
  }
}

// POST /api/emails — receive email from CF Worker (auth via X-Email-Secret header)
export async function POST(request: Request) {
  try {
    if (!verifyInternalSecret(request, "EMAIL_WEBHOOK_SECRET", "X-Email-Secret")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { fromEmail, toEmail, subject, body: emailBody, bodyText, bodyHtml, messageId, category } = body as {
      fromEmail: string;
      toEmail: string;
      subject: string;
      body: string;
      bodyText?: string;
      bodyHtml?: string;
      messageId?: string;
      category?: string;
    };

    if (!fromEmail || !toEmail || !subject || !emailBody) {
      return Response.json({ error: "fromEmail, toEmail, subject, body are required" }, { status: 400 });
    }

    const email = await prisma.email.create({
      data: {
        fromEmail,
        toEmail,
        subject,
        body: emailBody,
        bodyText: bodyText ?? null,
        bodyHtml: bodyHtml ?? null,
        messageId: messageId ?? null,
        category: category ?? "other",
      },
    });

    return Response.json(email, { status: 201 });
  } catch (error) {
    // REV-20260512-075: P2002 = unique constraint violation (duplicate messageId).
    // CF Worker may redeliver the same email on timeout — return 200 so it does
    // not keep retrying.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return Response.json({ deduplicated: true }, { status: 200 });
    }
    console.error("POST /api/emails error:", error);
    return Response.json({ error: "Failed to save email" }, { status: 500 });
  }
}
