import { prisma } from "@/lib/prisma"
import { downloadTelegramFile, downloadTelegramFileWithName } from "@/lib/telegram"
import { getBotMessages, escapeHtml } from "@/lib/telegram-i18n"
import { sendAndSave, findUserByTelegramId, ensureChatIdSaved, transcribeAudio, addMessageToInitiative } from "../lib/telegram-helpers"
import type { TelegramMessage } from "../lib/types"

/**
 * Spawn a Claude Code COO agent (Ola) session for a message
 */
function spawnOlaSession(chatId: string, userId: string, userName: string, messageText: string) {
  const { execFile } = require("child_process") as typeof import("child_process")
  const botToken = process.env.TG_BOT_TOKEN
  const sessionId = Date.now().toString(36)

  // Sanitize identifiers: chatId and userId must be alphanumeric/dash/underscore only
  const safeChatId = chatId.replace(/[^a-zA-Z0-9_-]/g, "")
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "")

  if (!safeChatId || !safeUserId) {
    console.error("spawnOlaSession: invalid chatId or userId — refusing to spawn")
    return
  }

  const promptMeta = JSON.stringify({ chatId: safeChatId, userId: safeUserId, userName, messageText, botToken })

  const prompt = [
    `Ти — Ола, COO агент Vibe Studio. Обробити повідомлення від клієнта через Telegram бот @vibe_studio_aibot.`,
    ``,
    `Клієнт: ${userName} (userId: ${safeUserId}, chatId: ${safeChatId})`,
    `Повідомлення: ${messageText}`,
    ``,
    `ІНСТРУКЦІЯ:`,
    `1. Подивись існуючі ініціативи клієнта:`,
    `   ssh vps 'docker exec pg psql -U vs -d vs -t -c "SELECT id, LEFT(COALESCE(title, \\\"rawIdea\\\"), 100), status FROM \\\"Initiative\\\" WHERE \\\"userId\\\"='"'"'${safeUserId}'"'"' AND status != '"'"'DONE'"'"' ORDER BY \\\"updatedAt\\\" DESC LIMIT 10;"'`,
    ``,
    `2. Визнач чи повідомлення стосується існуючої ініціативи чи це нова ідея.`,
    ``,
    `3. Якщо ДОПОВНЕННЯ до існуючої ініціативи:`,
    `   ssh vps 'docker exec pg psql -U vs -d vs -c "INSERT INTO \\\"InitiativeMessage\\\" (id, \\\"initiativeId\\\", type, content, \\\"fromUserId\\\", \\\"createdAt\\\") VALUES (gen_random_uuid()::text, '"'"'INITIATIVE_ID'"'"', '"'"'clarification'"'"', '"'"'ТЕКСТ'"'"', '"'"'${safeUserId}'"'"', NOW());"'`,
    `   Відповідь клієнту мовою повідомлення: "Додано до ідеї: [назва]"`,
    ``,
    `4. Якщо НОВА ідея:`,
    `   - Створи Initiative в БД`,
    `   - Створи Task з ticketId TG-YYYYMMDD-NNNN`,
    `   - Розбий на конкретні підзадачі (3-7 штук) і створи їх`,
    `   - Оновити статус Initiative на PLANNED з title та summary`,
    `   Відповідь клієнту мовою повідомлення: "Нова ідея створена та спланована: [назва]"`,
    ``,
    `5. ОБОВ'ЯЗКОВО відповідь клієнту МОВОЮ ПОВІДОМЛЕННЯ через curl (використовуй змінні з середовища або хардкодь безпечно).`,
    ``,
    `ВАЖЛИВО: Відповідай мовою клієнта (якщо пише українською — відповідай українською, англійською — англійською, іспанською — іспанською).`,
  ].join("\n")

  const tmpPrompt = `/tmp/ola-${sessionId}.txt`
  const tmpLog = `/tmp/ola-${sessionId}.log`
  const tmpMeta = `/tmp/ola-meta-${sessionId}.json`

  const remoteScript = [
    `printf '%s' ${JSON.stringify(promptMeta)} > ${tmpMeta}`,
    `python3 -c "import sys,json; d=json.load(open('${tmpMeta}')); open('${tmpPrompt}','w').write(d['messageText'][:4000])" 2>/dev/null || true`,
    `python3 -c "
import json
d = json.load(open('${tmpMeta}'))
prompt = '''${prompt.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'''
open('${tmpPrompt}', 'w').write(prompt)
" 2>/dev/null`,
    `nohup claude -p "$(cat ${tmpPrompt})" > ${tmpLog} 2>&1 &`,
    `rm -f ${tmpMeta}`,
  ].join("\n")

  execFile("ssh", ["-F", "/ssh-keys/config", "vps", remoteScript], { timeout: 15000 }, (err: Error | null) => {
    if (err) console.error("Failed to spawn Ola session:", err)
    else console.log(`Ola session ${sessionId} spawned for chat ${safeChatId}`)
  })
}

export async function handleVoiceMessage(
  chatId: string,
  telegramId: string,
  fileId: string,
  languageCode?: string,
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

    if (user.role === "CLIENT") {
      await handleClientMessage(chatId, user, text)
    } else {
      await sendAndSave(chatId, m.olaProcessing)
      spawnOlaSession(chatId, user.id, user.name || user.telegramUsername || "клієнт", text)
    }
  } catch (error) {
    console.error("Voice message error:", error)
    await sendAndSave(chatId, m.errorGeneric)
  }
}

export async function handleNewIdea(chatId: string, telegramId: string, ideaText: string) {
  const user = await findUserByTelegramId(telegramId)
  if (!user) {
    const m = getBotMessages(null)
    await sendAndSave(chatId, m.accountNotLinked)
    return
  }

  if (user.role === "CLIENT") {
    await handleClientMessage(chatId, user, ideaText)
    return
  }

  const m = getBotMessages(user.locale)
  await sendAndSave(chatId, m.olaProcessing)
  spawnOlaSession(chatId, user.id, user.name || user.telegramUsername || "клієнт", ideaText)
}

export async function handleReply(
  chatId: string,
  telegramId: string,
  answerText: string,
  originalText: string,
): Promise<boolean> {
  const titleMatch = originalText.match(/[\u2018\u2019']([^\u2018\u2019']+)[\u2018\u2019']/)
  if (!titleMatch) return false

  const title = titleMatch[1].trim().slice(0, 100)

  const user = await findUserByTelegramId(telegramId)
  if (!user) {
    const m = getBotMessages(null)
    await sendAndSave(chatId, m.accountNotLinked)
    return true
  }

  const m = getBotMessages(user.locale)

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

export async function handleFileMessage(
  chatId: string,
  telegramId: string,
  message: TelegramMessage,
) {
  const user = await findUserByTelegramId(telegramId)
  if (!user) {
    const m = getBotMessages(null)
    await sendAndSave(chatId, m.accountNotLinked)
    return
  }

  if (user.role === "OWNER") {
    const caption = message.caption || "[file attached]"
    const m = getBotMessages(user.locale)
    await sendAndSave(chatId, m.olaProcessing)
    spawnOlaSession(chatId, user.id, user.name || user.telegramUsername || "клієнт", caption)
    return
  }

  const fileId = message.document?.file_id
    || (message.photo && message.photo.length > 0
      ? message.photo[message.photo.length - 1].file_id
      : null)

  if (!fileId) {
    return
  }

  try {
    const { buffer, fileName } = await downloadTelegramFileWithName(fileId)

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

// --- Client routing ---

async function handleClientMessage(
  chatId: string,
  user: { id: string; locale: string | null; telegramUsername: string | null; name: string | null },
  messageText: string,
  fileInfo?: { fileName: string; filePath: string },
) {
  const m = getBotMessages(user.locale)

  await ensureChatIdSaved(chatId, user.id)

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
    await createClientInitiative(chatId, user, content, m)
    return
  }

  if (activeInitiatives.length === 1) {
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

  const pendingKey = Date.now().toString(36)

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

  buttons.push([{
    text: user.locale === "uk" ? "Нова ініціатива" : user.locale === "es" ? "Nueva iniciativa" : "New initiative",
    callback_data: `route_msg:new:${pendingKey}`,
  }])

  await sendAndSave(chatId, m.clientSelectInitiative, {
    replyMarkup: { inline_keyboard: buttons },
  })
}

async function createClientInitiative(
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
