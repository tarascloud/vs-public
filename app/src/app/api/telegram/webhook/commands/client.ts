import { prisma } from "@/lib/prisma"
import { getBotMessages, escapeHtml } from "@/lib/telegram-i18n"
import { answerCallbackQuery } from "@/lib/telegram"
import type { TelegramCallbackQuery } from "../types"
import { sendAndSave, findUserByTelegramId, ensureChatIdSaved } from "../helpers"

export async function handleClientMessage(
  chatId: string,
  user: { id: string; locale: string | null; telegramUsername: string | null; name: string | null },
  messageText: string,
  fileInfo?: { fileName: string; filePath: string }
) {
  const m = getBotMessages(user.locale)

  // Save telegramChatId if not yet stored
  await ensureChatIdSaved(chatId, user.id)

  // Find active initiatives for this client
  const activeInitiatives = await prisma.initiative.findMany({
    where: {
      userId: user.id,
      status: { in: ["IDEA", "PLANNING", "PLANNED", "IN_PROGRESS"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  })

  const content = fileInfo
    ? `${messageText || ""}\n\n[File: ${fileInfo.fileName}](${fileInfo.filePath})`.trim()
    : messageText

  if (activeInitiatives.length === 0) {
    // No active initiatives -- create a new one
    await createClientInitiative(chatId, user, content, m)
    return
  }

  if (activeInitiatives.length === 1) {
    // Single active initiative -- add message directly
    const initiative = activeInitiatives[0]
    await addMessageToInitiative(initiative.id, content, user.id)

    const title = initiative.title || initiative.rawIdea.slice(0, 60)
    if (fileInfo) {
      await sendAndSave(chatId, m.clientFileAdded(escapeHtml(title)))
    } else {
      await sendAndSave(chatId, m.clientMessageAdded(escapeHtml(title)))
    }
    return
  }

  // Multiple active initiatives -- ask which one with inline keyboard
  const pendingKey = Date.now().toString(36)

  // Store pending content in DB as a special initiative message
  await prisma.initiativeMessage.create({
    data: {
      initiativeId: activeInitiatives[0].id,
      type: "pending_routing",
      content: JSON.stringify({ pendingKey, content, userId: user.id }),
      fromUserId: user.id,
    },
  })

  const buttons: Array<Array<{ text: string; callback_data: string }>> = activeInitiatives.map((init: { id: string; title: string | null; rawIdea: string }) => [{
    text: (init.title || init.rawIdea.slice(0, 40)).slice(0, 40),
    callback_data: `route_msg:${init.id}:${pendingKey}`,
  }])

  // Add "New initiative" button
  buttons.push([{
    text: user.locale === "uk" ? "Nova initsiativa" : user.locale === "es" ? "Nueva iniciativa" : "New initiative",
    callback_data: `route_msg:new:${pendingKey}`,
  }])

  await sendAndSave(chatId, m.clientSelectInitiative, {
    replyMarkup: { inline_keyboard: buttons },
  })
}

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
    // Clean up the invalid pending message
    await prisma.initiativeMessage.delete({ where: { id: pendingMsg.id } })
    return
  }

  // Delete the temporary pending message
  await prisma.initiativeMessage.delete({ where: { id: pendingMsg.id } })

  if (targetInitiativeId === "new") {
    await createClientInitiative(chatId, user, parsed.content, m)
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

async function createClientInitiative(
  chatId: string,
  user: { id: string; locale: string | null; name: string | null; telegramUsername: string | null },
  content: string,
  m: ReturnType<typeof getBotMessages>
) {
  // Find user's first project
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

  // Add the content as the first message
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

async function addMessageToInitiative(
  initiativeId: string,
  content: string,
  userId: string
) {
  await prisma.initiativeMessage.create({
    data: {
      initiativeId,
      type: "clarification",
      content: content.slice(0, 4000),
      fromUserId: userId,
    },
  })

  // Touch the initiative updatedAt
  await prisma.initiative.update({
    where: { id: initiativeId },
    data: { updatedAt: new Date() },
  })
}
