import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface ConversationRow {
  chatId: string;
  username: string | null;
  firstName: string | null;
  lastMessage: string;
  lastMessageAt: Date;
  totalMessages: bigint;
}

// GET /api/telegram/messages — list conversations grouped by chatId (OWNER only)
export async function GET() {
  try {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const rows = await prisma.$queryRaw<ConversationRow[]>`
      SELECT DISTINCT ON ("chatId")
        "chatId",
        "username",
        "firstName",
        "text" AS "lastMessage",
        "createdAt" AS "lastMessageAt",
        COUNT(*) OVER (PARTITION BY "chatId") AS "totalMessages"
      FROM "TelegramMessage"
      ORDER BY "chatId", "createdAt" DESC
    `;

    const conversations = rows.map((row) => ({
      chatId: row.chatId,
      username: row.username,
      firstName: row.firstName,
      lastMessage: row.lastMessage,
      lastMessageAt: row.lastMessageAt,
      totalMessages: Number(row.totalMessages),
    }));

    // Sort by lastMessageAt descending
    conversations.sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );

    return Response.json(conversations);
  } catch (error) {
    console.error("GET /api/telegram/messages error:", error);
    return Response.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }
}
