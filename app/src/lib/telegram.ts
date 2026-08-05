const BOT_TOKEN = process.env.TG_BOT_TOKEN

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: { replyMarkup?: object; parseMode?: string; replyToMessageId?: number }
) {
  if (!BOT_TOKEN) {
    console.error("TG_BOT_TOKEN env var is not set")
    return { ok: false, error: "Bot token not configured" }
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode || "HTML",
      ...(options?.replyMarkup && { reply_markup: options.replyMarkup }),
      ...(options?.replyToMessageId && {
        reply_parameters: { message_id: options.replyToMessageId },
      }),
    }),
  })
  return res.json()
}

export async function setWebhook(webhookUrl: string, secretToken?: string) {
  if (!BOT_TOKEN) {
    return { ok: false, error: "Bot token not configured" }
  }

  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        ...(secretToken && { secret_token: secretToken }),
      }),
    }
  )
  return res.json()
}

export async function getWebhookInfo() {
  if (!BOT_TOKEN) {
    return { ok: false, error: "Bot token not configured" }
  }

  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`
  )
  return res.json()
}

export async function setMessageReaction(
  chatId: string | number,
  messageId: number,
  emoji: string // 👀 ✅ 👍 ❌ 🔥 etc.
) {
  if (!BOT_TOKEN) return { ok: false }
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/setMessageReaction`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: "emoji", emoji }],
      }),
    }
  )
  return res.json()
}

export async function downloadTelegramFileWithName(fileId: string): Promise<{ buffer: Buffer; fileName: string }> {
  if (!BOT_TOKEN) {
    throw new Error("TG_BOT_TOKEN env var is not set")
  }

  const fileInfo = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
  )
  const { result } = await fileInfo.json()

  if (!result?.file_path) {
    throw new Error("Could not get file path from Telegram")
  }

  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${result.file_path}`
  const res = await fetch(fileUrl)

  if (!res.ok) {
    throw new Error(`Failed to download file: ${res.status}`)
  }

  const fileName = (result.file_path as string).split("/").pop() || "file"
  return { buffer: Buffer.from(await res.arrayBuffer()), fileName }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  if (!BOT_TOKEN) return { ok: false }
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        ...(text && { text }),
      }),
    }
  )
  return res.json()
}

export async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  if (!BOT_TOKEN) {
    throw new Error("TG_BOT_TOKEN env var is not set")
  }

  // Get file path from Telegram
  const fileInfo = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
  )
  const { result } = await fileInfo.json()

  if (!result?.file_path) {
    throw new Error("Could not get file path from Telegram")
  }

  // Download file
  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${result.file_path}`
  const res = await fetch(fileUrl)

  if (!res.ok) {
    throw new Error(`Failed to download file: ${res.status}`)
  }

  return Buffer.from(await res.arrayBuffer())
}
