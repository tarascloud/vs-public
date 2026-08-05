import { prisma } from "@/lib/prisma"
import { setMessageReaction } from "@/lib/telegram"
import { timingSafeEqual } from "crypto"
import { handleStart, handleStatus, handleTasks, handleQuestion, handleHelp } from "./commands"
import { handleCallbackQuery } from "./handlers/callback"
import { handleVoiceMessage, handleNewIdea, handleReply, handleFileMessage } from "./handlers/message"
import type { TelegramUpdate } from "./lib/types"

export const dynamic = "force-dynamic"

// PUBLIC: Telegram webhook — authenticated via X-Telegram-Bot-Api-Secret-Token header
export async function POST(request: Request) {
  try {
    // Validate webhook secret via header (set via secret_token in setWebhook)
    const secret = request.headers.get("x-telegram-bot-api-secret-token")
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET

    if (!expectedSecret || !secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    let secretMatch = false
    try {
      const a = Buffer.from(secret, "utf8")
      const b = Buffer.from(expectedSecret, "utf8")
      if (a.length === b.length) {
        secretMatch = timingSafeEqual(a, b)
      } else {
        const maxLen = Math.max(a.length, b.length)
        const aPadded = Buffer.concat([a, Buffer.alloc(maxLen - a.length)])
        const bPadded = Buffer.concat([b, Buffer.alloc(maxLen - b.length)])
        timingSafeEqual(aPadded, bPadded) // discard result
        secretMatch = false
      }
    } catch {
      secretMatch = false
    }

    if (!secretMatch) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const update: TelegramUpdate = await request.json()

    // Handle callback queries (inline keyboard button presses)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query)
      return Response.json({ ok: true })
    }

    const message = update.message

    if (!message) {
      return Response.json({ ok: true })
    }

    const chatId = String(message.chat.id)
    const telegramId = String(message.from.id)
    const msgId = message.message_id

    // Save incoming message to DB for Communication tab
    try {
      await prisma.telegramMessage.create({
        data: {
          chatId,
          userId: telegramId,
          username: message.from?.username || null,
          firstName: message.from?.first_name || null,
          direction: "INCOMING",
          text: message.text || "[voice/media]",
          messageId: message.message_id,
        },
      });
    } catch (e) {
      console.error("Failed to save telegram message:", e);
    }

    // React with eyes to acknowledge receipt
    await setMessageReaction(chatId, msgId, "\ud83d\udc40")

    // Handle voice messages
    if (message.voice) {
      await handleVoiceMessage(chatId, telegramId, message.voice.file_id, message.from.language_code)
      await setMessageReaction(chatId, msgId, "\u2705")
      return Response.json({ ok: true })
    }

    // Handle documents and photos from clients
    if (message.document || message.photo) {
      await handleFileMessage(chatId, telegramId, message)
      await setMessageReaction(chatId, msgId, "\u2705")
      return Response.json({ ok: true })
    }

    if (!message.text) {
      return Response.json({ ok: true })
    }

    const text = message.text.trim().slice(0, 4000)

    // Command routing
    if (text.startsWith("/start")) {
      const token = text.split(" ")[1]?.trim()
      await handleStart(chatId, telegramId, message.from.username, message.from.language_code, token)
      await setMessageReaction(chatId, msgId, "\u2705")
      return Response.json({ ok: true })
    }

    if (text === "/status") {
      await handleStatus(chatId, telegramId)
      await setMessageReaction(chatId, msgId, "\u2705")
      return Response.json({ ok: true })
    }

    if (text === "/tasks") {
      await handleTasks(chatId, telegramId)
      await setMessageReaction(chatId, msgId, "\u2705")
      return Response.json({ ok: true })
    }

    if (text.startsWith("/question")) {
      const questionText = text.slice("/question".length).trim()
      await handleQuestion(chatId, telegramId, questionText)
      await setMessageReaction(chatId, msgId, "\u2705")
      return Response.json({ ok: true })
    }

    if (text === "/help") {
      await handleHelp(chatId, telegramId)
      await setMessageReaction(chatId, msgId, "\u2705")
      return Response.json({ ok: true })
    }

    // Reply to a question/blocker
    if (message.reply_to_message?.text) {
      const handled = await handleReply(chatId, telegramId, text, message.reply_to_message.text)
      if (handled) {
        await setMessageReaction(chatId, msgId, "\u2705")
        return Response.json({ ok: true })
      }
    }

    // Regular message -> create task/initiative
    await handleNewIdea(chatId, telegramId, text)
    await setMessageReaction(chatId, msgId, "\u2705")
    return Response.json({ ok: true })
  } catch (error) {
    console.error("Telegram webhook error:", error)
    return Response.json({ ok: true })
  }
}
