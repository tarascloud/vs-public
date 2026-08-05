import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { randomBytes } from "crypto"

export const dynamic = "force-dynamic"

// POST /api/telegram/link
// OWNER generates a link token for a specific user (by userId)
// CLIENT generates a link token for themselves
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true },
    })

    if (!currentUser) {
      return Response.json({ error: "User not found" }, { status: 404 })
    }

    let targetUserId: string

    if (currentUser.role === "OWNER") {
      // Owner can generate token for any user
      const body = await request.json().catch(() => ({}))
      targetUserId = (body as { userId?: string }).userId ?? currentUser.id
    } else {
      // CLIENT generates token for themselves only
      targetUserId = currentUser.id
    }

    // Invalidate any existing unused tokens for this user
    await prisma.telegramLinkToken.deleteMany({
      where: {
        userId: targetUserId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    })

    // Generate a new one-time token (48 hex chars)
    const token = randomBytes(24).toString("hex")
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    await prisma.telegramLinkToken.create({
      data: { token, userId: targetUserId, expiresAt },
    })

    const botUsername = process.env.TG_BOT_USERNAME || "vibe_studio_aibot"
    const deepLink = `https://t.me/${botUsername}?start=${token}`

    return Response.json({ token, deepLink, expiresAt })
  } catch (error) {
    console.error("Telegram link error:", error)
    return Response.json({ error: "Failed to generate link token" }, { status: 500 })
  }
}

// GET /api/telegram/link — check current user's link status
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        telegramId: true,
        telegramChatId: true,
        telegramUsername: true,
      },
    })

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 })
    }

    return Response.json({
      linked: !!(user.telegramId || user.telegramChatId),
      telegramUsername: user.telegramUsername,
    })
  } catch (error) {
    console.error("Telegram link status error:", error)
    return Response.json({ error: "Failed to get link status" }, { status: 500 })
  }
}
