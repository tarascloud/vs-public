import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// GET /api/telegram/messages/[chatId] — conversation history (OWNER only)
// REV22-046: added take/skip pagination to cap unbounded growth
export async function GET(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const { chatId } = await params;
    const { searchParams } = new URL(request.url);
    const take = Math.min(Math.max(parseInt(searchParams.get("take") ?? "200", 10) || 200, 1), 1000);
    const skip = Math.max(parseInt(searchParams.get("skip") ?? "0", 10) || 0, 0);

    const messages = await prisma.telegramMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
      take,
      skip,
    });

    return Response.json(messages);
  } catch (error) {
    console.error("GET /api/telegram/messages/[chatId] error:", error);
    return Response.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
