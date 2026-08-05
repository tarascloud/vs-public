import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// POST /api/telegram/messages/[chatId]/send — send message to chat (OWNER only)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const { chatId } = await params;

    const body = await request.json();
    const { text } = body as { text: string };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return Response.json({ error: "text is required" }, { status: 400 });
    }

    const botToken = process.env.TG_BOT_TOKEN;
    if (!botToken) {
      return Response.json({ error: "TG_BOT_TOKEN not configured" }, { status: 500 });
    }

    // Send message via Telegram Bot API
    const tgRes = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: text.trim() }),
      }
    );

    if (!tgRes.ok) {
      const errorBody = await tgRes.text();
      console.error("Telegram sendMessage error:", tgRes.status, errorBody);
      return Response.json({ error: "Failed to send Telegram message" }, { status: 502 });
    }

    const tgData = await tgRes.json() as { ok: boolean; result?: { message_id: number } };

    // Save as OUTGOING message in DB
    const saved = await prisma.telegramMessage.create({
      data: {
        chatId,
        direction: "OUTGOING",
        text: text.trim(),
        messageId: tgData.result?.message_id ?? null,
      },
    });

    return Response.json(saved, { status: 201 });
  } catch (error) {
    console.error("POST /api/telegram/messages/[chatId]/send error:", error);
    return Response.json({ error: "Failed to send message" }, { status: 500 });
  }
}
