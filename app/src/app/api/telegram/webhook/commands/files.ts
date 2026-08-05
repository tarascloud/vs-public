import { downloadTelegramFileWithName } from "@/lib/telegram"
import { getBotMessages } from "@/lib/telegram-i18n"
import type { TelegramMessage } from "../types"
import { sendAndSave, findUserByTelegramId } from "../helpers"
import { handleClientMessage } from "./client"
import { spawnOlaSession } from "./ola"

export async function handleFileMessage(
  chatId: string,
  telegramId: string,
  message: TelegramMessage
) {
  const user = await findUserByTelegramId(telegramId)
  if (!user) {
    const m = getBotMessages(null)
    await sendAndSave(chatId, m.accountNotLinked)
    return
  }

  // OWNER file messages go to Ola (Claude Code) with caption
  if (user.role === "OWNER") {
    const caption = message.caption || "[file attached]"
    const m = getBotMessages(user.locale)
    await sendAndSave(chatId, m.olaProcessing)
    spawnOlaSession(chatId, user.id, user.name || user.telegramUsername || "client", caption)
    return
  }

  // CLIENT file handling -- download and save
  const fileId = message.document?.file_id
    || (message.photo && message.photo.length > 0
      ? message.photo[message.photo.length - 1].file_id // largest photo
      : null)

  if (!fileId) {
    return
  }

  try {
    const { buffer, fileName } = await downloadTelegramFileWithName(fileId)

    // Ensure upload directory exists
    const { mkdirSync, writeFileSync } = await import("fs")
    const uploadDir = "/tmp/vs-uploads"
    mkdirSync(uploadDir, { recursive: true })

    const safeFileName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    const filePath = `${uploadDir}/${safeFileName}`
    writeFileSync(filePath, buffer)

    const caption = message.caption || message.text || ""
    await handleClientMessage(chatId, user, caption, { fileName: safeFileName, filePath })
  } catch (error) {
    console.error("File download error:", error)
    const m = getBotMessages(user.locale)
    await sendAndSave(chatId, m.errorGeneric)
  }
}
