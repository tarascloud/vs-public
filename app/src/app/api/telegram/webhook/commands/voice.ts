import { downloadTelegramFile } from "@/lib/telegram"
import { getBotMessages } from "@/lib/telegram-i18n"
import { sendAndSave, findUserByTelegramId, transcribeAudio } from "../helpers"
import { handleClientMessage } from "./client"
import { spawnOlaSession } from "./ola"

export async function handleVoiceMessage(
  chatId: string,
  telegramId: string,
  fileId: string,
  languageCode?: string
) {
  const user = await findUserByTelegramId(telegramId)
  if (!user) {
    const m = getBotMessages(languageCode)
    await sendAndSave(chatId, m.accountNotLinked)
    return
  }
  const m = getBotMessages(user.locale)
  try {
    const audioBuffer = await downloadTelegramFile(fileId)
    const transcription = await transcribeAudio(audioBuffer)
    if (!transcription.text || transcription.text.trim().length === 0) {
      await sendAndSave(chatId, m.errorGeneric)
      return
    }
    const text = transcription.text.trim()

    // Route based on user role
    if (user.role === "CLIENT") {
      await handleClientMessage(chatId, user, text)
    } else {
      await sendAndSave(chatId, m.olaProcessing)
      spawnOlaSession(chatId, user.id, user.name || user.telegramUsername || "client", text)
    }
  } catch (error) {
    console.error("Voice message error:", error)
    await sendAndSave(chatId, m.errorGeneric)
  }
}
