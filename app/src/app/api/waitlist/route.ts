import { prisma } from "@/lib/prisma"
import { sendTelegramMessage } from "@/lib/telegram"
import { rateLimitOrNull } from "@/lib/rate-limit"
import { z } from "zod"

export const dynamic = "force-dynamic"

const OWNER_CHAT_ID = process.env.TG_CHAT_OWNER // ARC-20260507-0002: required env (no hardcoded fallback)

const WaitlistSchema = z.object({
  name: z.string().max(100).optional(),
  email: z.string().email("Invalid email address"),
  message: z.string().max(500).optional(),
})

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export async function POST(request: Request) {
  // REV-20260512-060: rate-limit writes — POST triggers DB write + Telegram alert to owner
  const blocked = await rateLimitOrNull("waitlist:write", {
    limit: 5,
    windowMs: 60_000,
  })
  if (blocked) return blocked

  try {
    const body = await request.json()

    const parsed = WaitlistSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      )
    }

    const { name, email, message } = parsed.data

    // Check if already signed up
    const existing = await prisma.waitlistSignup.findUnique({
      where: { email },
    })

    if (existing) {
      return Response.json(
        { error: "This email is already on the waitlist" },
        { status: 409 }
      )
    }

    // Save to DB
    const signup = await prisma.waitlistSignup.create({
      data: { name, email, message },
    })

    // Send Telegram notification to owner
    const dateStr = new Intl.DateTimeFormat("uk-UA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Kyiv",
    }).format(signup.createdAt)

    const lines = [
      `<b>Новий запис у waitlist Vibe Studio!</b>`,
      ``,
      name ? `<b>Ім'я:</b> ${escapeHtml(name)}` : null,
      `<b>Email:</b> ${escapeHtml(email)}`,
      message ? `<b>Повідомлення:</b> ${escapeHtml(message)}` : null,
      `<b>Час:</b> ${dateStr}`,
    ]
      .filter((l) => l !== null)
      .join("\n")

    // Fire-and-forget — не блокуємо відповідь клієнту
    OWNER_CHAT_ID && sendTelegramMessage(OWNER_CHAT_ID, lines).catch((err) =>
      console.error("Waitlist TG notify error:", err)
    )

    return Response.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error("Waitlist signup error:", error)
    return Response.json(
      { error: "Failed to process signup" },
      { status: 500 }
    )
  }
}

export async function GET() {
  const blocked = await rateLimitOrNull("waitlist", {
    limit: 10,
    windowMs: 60_000,
  })
  if (blocked) return blocked

  // Count only — no PII exposed
  const count = await prisma.waitlistSignup.count()
  return Response.json({ count })
}
