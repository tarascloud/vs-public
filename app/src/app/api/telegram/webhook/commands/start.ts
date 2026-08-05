import { prisma } from "@/lib/prisma"
import { getBotMessages } from "@/lib/telegram-i18n"
import { sendAndSave, findUserByTelegramId } from "../lib/telegram-helpers"

export async function handleStart(
  chatId: string,
  telegramId: string,
  username?: string,
  languageCode?: string,
  token?: string,
) {
  // If token provided — try to link account
  if (token) {
    const linkToken = await prisma.telegramLinkToken.findUnique({
      where: { token },
      include: { user: true },
    })

    if (!linkToken || linkToken.usedAt || linkToken.expiresAt < new Date()) {
      const m = getBotMessages(languageCode)
      await sendAndSave(chatId, m.accountNotLinked)
      return
    }

    // Link the account
    const locale = linkToken.user.locale || (languageCode === "uk" ? "uk" : "en")
    await prisma.user.update({
      where: { id: linkToken.user.id },
      data: {
        telegramId,
        telegramChatId: chatId,
        ...(username && { telegramUsername: username }),
        locale,
      },
    })

    await prisma.telegramLinkToken.update({
      where: { token },
      data: { usedAt: new Date() },
    })

    const m = getBotMessages(locale)
    await sendAndSave(chatId, m.accountLinked(linkToken.user.name || linkToken.user.email || ""))
    return
  }

  // Try to auto-link by username
  if (username) {
    const user = await prisma.user.findFirst({
      where: {
        telegramUsername: username,
        telegramId: null,
      },
    })

    if (user) {
      const locale = user.locale || (languageCode === "uk" ? "uk" : "en")
      await prisma.user.update({
        where: { id: user.id },
        data: {
          telegramId,
          telegramChatId: chatId,
          locale,
        },
      })

      const m = getBotMessages(locale)
      await sendAndSave(chatId, m.welcome(user.name || username))
      return
    }
  }

  // Check if already linked
  const existingUser = await findUserByTelegramId(telegramId)
  if (existingUser) {
    const m = getBotMessages(existingUser.locale)
    await sendAndSave(chatId, m.welcomeBack(existingUser.name || ""))
    return
  }

  const m = getBotMessages(languageCode)
  await sendAndSave(chatId, m.welcomeUnknown)
}
