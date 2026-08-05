import { prisma } from "@/lib/prisma"
import { answerCallbackQuery } from "@/lib/telegram"
import { getBotMessages, escapeHtml } from "@/lib/telegram-i18n"
import { sendAndSave, findUserByTelegramId, addMessageToInitiative } from "../lib/telegram-helpers"
import type { TelegramCallbackQuery } from "../lib/types"

export async function handleCallbackQuery(cbq: TelegramCallbackQuery) {
  const data = cbq.data
  if (!data?.startsWith("route_msg:")) {
    await answerCallbackQuery(cbq.id)
    return
  }

  const chatId = String(cbq.message?.chat?.id || cbq.from.id)
  const telegramId = String(cbq.from.id)

  const user = await findUserByTelegramId(telegramId)
  if (!user) {
    await answerCallbackQuery(cbq.id, "Account not linked")
    return
  }

  const m = getBotMessages(user.locale)

  // Parse: route_msg:<initiativeId|new>:<pendingKey>
  const parts = data.split(":")
  const targetInitiativeId = parts[1]
  const pendingKey = parts.slice(2).join(":")

  // Find pending message
  const pendingMsg = await prisma.initiativeMessage.findFirst({
    where: {
      type: "pending_routing",
      content: { contains: pendingKey },
      fromUserId: user.id,
    },
    orderBy: { createdAt: "desc" },
  })

  if (!pendingMsg) {
    await answerCallbackQuery(cbq.id, "Message expired. Please send again.")
    return
  }

  let parsed: { content: string; userId: string }
  try {
    parsed = JSON.parse(pendingMsg.content)
  } catch {
    await answerCallbackQuery(cbq.id, "Error processing message.")
    await prisma.initiativeMessage.delete({ where: { id: pendingMsg.id } })
    return
  }

  // Delete the temporary pending message
  await prisma.initiativeMessage.delete({ where: { id: pendingMsg.id } })

  if (targetInitiativeId === "new") {
    await createClientInitiativeFromCallback(chatId, user, parsed.content, m)
  } else {
    await addMessageToInitiative(targetInitiativeId, parsed.content, user.id)

    const initiative = await prisma.initiative.findUnique({
      where: { id: targetInitiativeId },
      select: { title: true, rawIdea: true },
    })
    const title = initiative?.title || initiative?.rawIdea?.slice(0, 60) || "Initiative"
    await sendAndSave(chatId, m.clientMessageAdded(escapeHtml(title)))
  }

  await answerCallbackQuery(cbq.id)
}

async function createClientInitiativeFromCallback(
  chatId: string,
  user: { id: string; locale: string | null; name: string | null; telegramUsername: string | null },
  content: string,
  m: ReturnType<typeof getBotMessages>,
) {
  const projectAccess = await prisma.projectAccess.findFirst({
    where: { userId: user.id },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  })

  const projectId = projectAccess?.projectId
    ?? (await prisma.project.findFirst({ where: { name: "Vibe Studio" } }))?.id

  if (!projectId) {
    await sendAndSave(chatId, m.errorGeneric)
    return
  }

  const title = content.slice(0, 100)

  const initiative = await prisma.initiative.create({
    data: {
      rawIdea: content.slice(0, 4000),
      title,
      userId: user.id,
      projectId,
      status: "IDEA",
    },
  })

  await prisma.initiativeMessage.create({
    data: {
      initiativeId: initiative.id,
      type: "idea",
      content: content.slice(0, 4000),
      fromUserId: user.id,
    },
  })

  await sendAndSave(chatId, m.clientNewInitiativeCreated(escapeHtml(title)))
}
