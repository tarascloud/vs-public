import { prisma } from "@/lib/prisma"
import { getBotMessages } from "@/lib/telegram-i18n"
import { sendAndSave, findUserByTelegramId } from "../helpers"

export async function handleQuestion(chatId: string, telegramId: string, questionText: string) {
  const user = await findUserByTelegramId(telegramId)
  if (!user) {
    const m = getBotMessages(null)
    await sendAndSave(chatId, m.accountNotLinked)
    return
  }

  const m = getBotMessages(user.locale)

  // Limit input length to prevent excessive DB storage and slow queries
  const sanitizedQuestion = questionText.trim().slice(0, 2000)

  if (!sanitizedQuestion) {
    await sendAndSave(chatId, m.helpText)
    return
  }

  // Find user's first active project for context
  const projectAccess = await prisma.projectAccess.findFirst({
    where: { userId: user.id },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  })

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const count = await prisma.task.count({
    where: { ticketId: { startsWith: `Q-${dateStr}` } },
  })
  const ticketId = `Q-${dateStr}-${String(count + 1).padStart(4, "0")}`

  // Create initiative to track this question
  const questionInitiative = await prisma.initiative.create({
    data: {
      rawIdea: sanitizedQuestion,
      userId: user.id,
      projectId: projectAccess?.projectId ?? (await prisma.project.findFirst({ where: { name: "Vibe Studio" } }))!.id,
    },
  })

  await prisma.task.create({
    data: {
      ticketId,
      title: sanitizedQuestion.length > 80 ? sanitizedQuestion.slice(0, 80) + "..." : sanitizedQuestion,
      description: `Question from Telegram client @${user.telegramUsername || telegramId}:\n\n${sanitizedQuestion}`,
      status: "TODO",
      priority: 1,
      projectId: projectAccess?.projectId ?? null,
      initiativeId: questionInitiative.id,
    },
  })

  await sendAndSave(chatId, m.questionCreated(ticketId))
}

export async function handleHelp(chatId: string, telegramId: string) {
  const user = await findUserByTelegramId(telegramId)
  const m = getBotMessages(user?.locale)
  await sendAndSave(chatId, m.helpText)
}
