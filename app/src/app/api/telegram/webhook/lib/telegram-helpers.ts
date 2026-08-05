import { prisma } from "@/lib/prisma"
import { sendTelegramMessage } from "@/lib/telegram"

const STT_URL = process.env.STT_URL || "http://host.docker.internal:8030"

/**
 * Send a Telegram message and persist it as OUTGOING in DB
 */
export async function sendAndSave(
  chatId: string,
  text: string,
  options?: { replyMarkup?: object; parseMode?: string; replyToMessageId?: number },
) {
  const result = await sendTelegramMessage(chatId, text, options)
  try {
    await prisma.telegramMessage.create({
      data: {
        chatId,
        direction: "OUTGOING",
        text,
        messageId: (result as { result?: { message_id?: number } })?.result?.message_id ?? null,
      },
    })
  } catch (e) {
    console.error("Failed to save outgoing telegram message:", e)
  }
  return result
}

/**
 * Find a user by their Telegram ID (checks both telegramId and telegramChatId)
 */
export async function findUserByTelegramId(telegramId: string) {
  return prisma.user.findFirst({
    where: {
      OR: [
        { telegramId },
        { telegramChatId: telegramId },
      ],
    },
  })
}

/**
 * Ensure the telegramChatId is saved for a user
 */
export async function ensureChatIdSaved(chatId: string, userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    })
    if (!user?.telegramChatId) {
      await prisma.user.update({
        where: { id: userId },
        data: { telegramChatId: chatId },
      })
    }
  } catch (e) {
    console.error("Failed to save telegramChatId:", e)
  }
}

/**
 * Transcribe audio using the STT service
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
): Promise<{ text: string; language?: string; duration?: number }> {
  const res = await fetch(STT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(audioBuffer.length),
    },
    body: new Uint8Array(audioBuffer),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`STT server error ${res.status}: ${errorBody}`)
  }

  return res.json()
}

/**
 * Add a message to an initiative and touch its updatedAt
 */
export async function addMessageToInitiative(
  initiativeId: string,
  content: string,
  userId: string,
) {
  await prisma.initiativeMessage.create({
    data: {
      initiativeId,
      type: "clarification",
      content: content.slice(0, 4000),
      fromUserId: userId,
    },
  })

  await prisma.initiative.update({
    where: { id: initiativeId },
    data: { updatedAt: new Date() },
  })
}
