import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// POST /api/emails/send — send email via Resend (OWNER only)
export async function POST(request: Request) {
  try {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const body = await request.json();
    const { to, subject, body: emailBody, inReplyTo, references } = body as {
      to: string;
      subject: string;
      body: string;
      inReplyTo?: string;
      references?: string;
    };

    if (!to || !subject || !emailBody) {
      return Response.json({ error: "to, subject, body are required" }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return Response.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${resendApiKey}`,
    };

    const emailHeaders: Record<string, string> = {};
    if (inReplyTo) {
      emailHeaders["In-Reply-To"] = inReplyTo;
    }
    if (references) {
      emailHeaders["References"] = references;
    }

    const payload: Record<string, unknown> = {
      from: "Vibe Studio <vs@example.com>",
      to,
      subject,
      text: emailBody,
    };

    if (Object.keys(emailHeaders).length > 0) {
      payload.headers = emailHeaders;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error("Resend API error:", res.status, errorBody);
      return Response.json({ error: "Failed to send email via Resend" }, { status: 502 });
    }

    const resendData = await res.json() as { id?: string };

    return Response.json({ success: true, resendId: resendData.id });
  } catch (error) {
    console.error("POST /api/emails/send error:", error);
    return Response.json({ error: "Failed to send email" }, { status: 500 });
  }
}
