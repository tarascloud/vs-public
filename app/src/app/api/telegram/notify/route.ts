import { prisma } from "@/lib/prisma"
import { sendTelegramMessage } from "@/lib/telegram"
import { getBotMessages, getTaskStatusLabel, escapeHtml } from "@/lib/telegram-i18n"
import { requireOwnerApi } from "@/lib/auth-helpers"
import { timingSafeEqual } from "crypto"

export const dynamic = "force-dynamic"

interface NotifyByTask {
  taskId: string
  type: "task_status" | "task_question" | "task_feedback"
  content?: string
}

interface NotifyByInitiative {
  initiativeId: string
  type: "question" | "blocker" | "status_change" | "task_completed"
  content: string
}

type NotifyBody = NotifyByTask | NotifyByInitiative

function isTaskNotify(body: NotifyBody): body is NotifyByTask {
  return "taskId" in body
}

export async function POST(request: Request) {
  // Allow internal server-to-server calls via secret header, fallback to session auth
  const internalSecret = request.headers.get("x-internal-secret");
  const expectedSecret = process.env.INTERNAL_API_SECRET;
  let isInternal = false;
  if (internalSecret && expectedSecret && internalSecret.length > 0 && expectedSecret.length > 0) {
    try {
      const a = Buffer.from(internalSecret, "utf8");
      const b = Buffer.from(expectedSecret, "utf8");
      // timingSafeEqual requires same-length buffers; pad shorter one to avoid length leak
      if (a.length === b.length) {
        isInternal = timingSafeEqual(a, b);
      } else {
        // lengths differ — always false, but still do constant-time work to avoid timing on length
        const maxLen = Math.max(a.length, b.length);
        const aPadded = Buffer.concat([a, Buffer.alloc(maxLen - a.length)]);
        const bPadded = Buffer.concat([b, Buffer.alloc(maxLen - b.length)]);
        timingSafeEqual(aPadded, bPadded); // discard result
        isInternal = false;
      }
    } catch {
      isInternal = false;
    }
  }

  if (!isInternal) {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const user = _gate.user;
  }

  try {
    const body: NotifyBody = await request.json()

    if (!body.type) {
      return Response.json({ error: "type is required" }, { status: 400 })
    }

    if (isTaskNotify(body)) {
      return handleTaskNotify(body)
    }

    return handleInitiativeNotify(body as NotifyByInitiative)
  } catch (error) {
    console.error("Telegram notify error:", error)
    return Response.json({ error: "Failed to send notification" }, { status: 500 })
  }
}

async function handleTaskNotify(body: NotifyByTask) {
  const { taskId, type, content } = body

  if (!taskId) {
    return Response.json({ error: "taskId is required" }, { status: 400 })
  }

  // Find task -> project -> users with access
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: {
        include: {
          access: {
            include: {
              user: {
                select: {
                  telegramChatId: true,
                  telegramId: true,
                  locale: true,
                  name: true,
                },
              },
            },
            where: {
              role: { in: ["CLIENT", "VIEWER"] },
            },
          },
        },
      },
    },
  })

  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 })
  }

  const usersToNotify = task.project?.access ?? []
  const results: unknown[] = []

  for (const access of usersToNotify) {
    const { user } = access
    const chatId = user.telegramChatId || user.telegramId
    if (!chatId) continue

    const m = getBotMessages(user.locale)
    let message: string

    switch (type) {
      case "task_status": {
        const statusLabel = getTaskStatusLabel(content ?? task.status, user.locale)
        message = m.notifyTaskStatus(escapeHtml(task.title), statusLabel)
        break
      }
      case "task_question":
        message = m.notifyQuestion(
          escapeHtml(task.title),
          escapeHtml(content ?? "")
        )
        break
      case "task_feedback":
        message = m.notifyFeedbackNeeded(escapeHtml(task.title))
        break
      default:
        continue
    }

    const result = await sendTelegramMessage(chatId, message)
    results.push({ userId: access.userId, sent: true, result })
  }

  return Response.json({ sent: results.length > 0, results })
}

async function handleInitiativeNotify(body: NotifyByInitiative) {
  const { initiativeId, type, content } = body

  if (!initiativeId || !content) {
    return Response.json(
      { error: "initiativeId and content are required" },
      { status: 400 }
    )
  }

  const initiative = await prisma.initiative.findUnique({
    where: { id: initiativeId },
    include: {
      user: {
        select: {
          telegramChatId: true,
          telegramId: true,
          locale: true,
          name: true,
        },
      },
    },
  })

  if (!initiative) {
    return Response.json({ error: "Initiative not found" }, { status: 404 })
  }

  // Canary initiatives (created by /opt/docker/scripts/canary-planning.sh daily
  // 08:30 UTC) exercise the auto-planning pipeline end-to-end. They transition
  // IDEA → PLANNING → PLANNED in ~2 min and get DELETEd. No human should ever
  // be paged about them — suppress notifications centrally rather than in
  // every status-transition call-site.
  if (initiative.title?.startsWith("canary-")) {
    return Response.json({ sent: false, reason: "canary_suppressed" })
  }

  const chatId = initiative.user.telegramChatId || initiative.user.telegramId
  if (!chatId) {
    return Response.json({ error: "User has no Telegram linked", sent: false })
  }

  const m = getBotMessages(initiative.user.locale)
  const title = initiative.title || initiative.rawIdea.slice(0, 50)
  let message: string

  switch (type) {
    case "question":
      message = m.notifyQuestion(escapeHtml(title), escapeHtml(content))
      break
    case "blocker":
      message =
        `<b>Blocker</b> on \u2018${escapeHtml(title)}\u2019\n\n${escapeHtml(content)}\n\nPlease respond to unblock.`
      break
    case "status_change":
      message = m.notifyTaskStatus(escapeHtml(title), escapeHtml(content))
      break
    case "task_completed":
      message = `<b>Task completed</b> on \u2018${escapeHtml(title)}\u2019: ${escapeHtml(content)}`
      break
    default:
      message = `Update on \u2018${escapeHtml(title)}\u2019: ${escapeHtml(content)}`
  }

  const result = await sendTelegramMessage(chatId, message)
  return Response.json({ sent: true, result })
}
