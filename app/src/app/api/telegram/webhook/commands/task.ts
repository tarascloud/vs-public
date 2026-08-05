import { prisma } from "@/lib/prisma"
import { getBotMessages, getTaskStatusLabel, escapeHtml } from "@/lib/telegram-i18n"
import { sendAndSave, findUserByTelegramId } from "../lib/telegram-helpers"

export async function handleTasks(chatId: string, telegramId: string) {
  const user = await findUserByTelegramId(telegramId)
  if (!user) {
    const m = getBotMessages(null)
    await sendAndSave(chatId, m.accountNotLinked)
    return
  }

  const m = getBotMessages(user.locale)

  const projectAccess = await prisma.projectAccess.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  })

  const projectIds = projectAccess.map((pa) => pa.projectId)

  if (projectIds.length === 0) {
    await sendAndSave(chatId, m.tasksEmpty)
    return
  }

  const tasks = await prisma.task.findMany({
    where: {
      projectId: { in: projectIds },
      status: { not: "DONE" },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 20,
    include: {
      project: { select: { name: true } },
    },
  })

  if (tasks.length === 0) {
    await sendAndSave(chatId, m.tasksEmpty)
    return
  }

  let text = m.tasksHeader
  for (const task of tasks) {
    const statusLabel = getTaskStatusLabel(task.status, user.locale)
    text += m.taskItem(task.ticketId, escapeHtml(task.title), statusLabel) + "\n"
  }

  await sendAndSave(chatId, text)
}

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
