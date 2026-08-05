import { prisma } from "@/lib/prisma"
import { getBotMessages } from "@/lib/telegram-i18n"
import { sendAndSave, findUserByTelegramId } from "../helpers"

export async function handleReply(
  chatId: string,
  telegramId: string,
  answerText: string,
  originalText: string
): Promise<boolean> {
  const titleMatch = originalText.match(/[\u2018\u2019']([^\u2018\u2019']+)[\u2018\u2019']/)
  if (!titleMatch) return false

  // Limit title length to prevent DoS via unbounded prisma contains query
  const title = titleMatch[1].trim().slice(0, 100)

  const user = await findUserByTelegramId(telegramId)
  if (!user) {
    const m = getBotMessages(null)
    await sendAndSave(chatId, m.accountNotLinked)
    return true
  }

  const m = getBotMessages(user.locale)

  // Try to answer a TaskQuestion
  const taskQuestion = await prisma.taskQuestion.findFirst({
    where: {
      question: { contains: title, mode: "insensitive" },
      status: "PENDING",
    },
    include: { task: { include: { project: true } } },
    orderBy: { createdAt: "desc" },
  })

  if (taskQuestion) {
    await prisma.taskQuestion.update({
      where: { id: taskQuestion.id },
      data: {
        answer: answerText,
        status: "ANSWERED",
        answeredAt: new Date(),
      },
    })
    await sendAndSave(chatId, m.replyToAnswer)
    return true
  }

  // Fallback: try Initiative
  const initiative = await prisma.initiative.findFirst({
    where: {
      userId: user.id,
      OR: [
        { title: { contains: title, mode: "insensitive" } },
        { rawIdea: { contains: title, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
  })

  if (!initiative) {
    await sendAndSave(chatId, m.initiativeNotFound)
    return true
  }

  await prisma.initiativeMessage.create({
    data: {
      initiativeId: initiative.id,
      type: "answer",
      content: answerText,
      fromUserId: user.id,
    },
  })

  await sendAndSave(chatId, m.replyToAnswer)
  return true
}
