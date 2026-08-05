import { auth } from "@/auth"
import { setWebhook, getWebhookInfo } from "@/lib/telegram"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    const session = await auth()
    if (session?.user?.role !== "OWNER") {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!secret) {
      return Response.json(
        { error: "TELEGRAM_WEBHOOK_SECRET not configured" },
        { status: 500 }
      )
    }

    const webhookUrl = `https://vibe-studio.example.com/api/telegram/webhook`
    const result = await setWebhook(webhookUrl, secret)

    return Response.json(result)
  } catch (error) {
    console.error("Webhook setup error:", error)
    return Response.json(
      { error: "Failed to set webhook" },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const session = await auth()
    if (session?.user?.role !== "OWNER") {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await getWebhookInfo()
    return Response.json(result)
  } catch (error) {
    console.error("Webhook info error:", error)
    return Response.json(
      { error: "Failed to get webhook info" },
      { status: 500 }
    )
  }
}
