import { getBotMessages } from "@/lib/telegram-i18n"
import { sendAndSave, findUserByTelegramId } from "../lib/telegram-helpers"

export async function handleHelp(chatId: string, telegramId: string) {
  const user = await findUserByTelegramId(telegramId)
  const m = getBotMessages(user?.locale)
  await sendAndSave(chatId, m.helpText)
}
