import { prisma } from "@/lib/prisma"
import { getBotMessages, escapeHtml } from "@/lib/telegram-i18n"
import { sendAndSave, findUserByTelegramId } from "../lib/telegram-helpers"

export async function handleStatus(chatId: string, telegramId: string) {
  const user = await findUserByTelegramId(telegramId)
  if (!user) {
    const m = getBotMessages(null)
    await sendAndSave(chatId, m.accountNotLinked)
    return
  }

  const m = getBotMessages(user.locale)

  const projectAccess = await prisma.projectAccess.findMany({
    where: { userId: user.id },
    include: {
      project: {
        include: {
          tasks: {
            select: { status: true },
          },
        },
      },
    },
  })

  const activeProjects = projectAccess.filter(
    (pa) => pa.project.status === "ACTIVE",
  )

  if (activeProjects.length === 0) {
    await sendAndSave(chatId, m.noProjects)
    return
  }

  let text = m.statusHeader(activeProjects.length)

  for (const pa of activeProjects) {
    const tasks = pa.project.tasks
    const total = tasks.length
    const done = tasks.filter((t) => t.status === "DONE").length
    const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length

    text += "\n" + m.statusProject(
      escapeHtml(pa.project.name),
      total,
      done,
      inProgress,
    )
  }

  await sendAndSave(chatId, text)
}
