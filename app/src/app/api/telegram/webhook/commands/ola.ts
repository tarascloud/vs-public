import { getBotMessages } from "@/lib/telegram-i18n"
import { sendAndSave, findUserByTelegramId } from "../helpers"
import { handleClientMessage } from "./client"

// Claude Code COO agent (Ola) -- each message gets its own session
export function spawnOlaSession(chatId: string, userId: string, userName: string, messageText: string) {
  const { execFile } = require("child_process") as typeof import("child_process")
  const botToken = process.env.TG_BOT_TOKEN
  const sessionId = Date.now().toString(36)

  // Sanitize identifiers: chatId and userId must be alphanumeric/dash/underscore only
  const safeChatId = chatId.replace(/[^a-zA-Z0-9_-]/g, "")
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "")

  if (!safeChatId || !safeUserId) {
    console.error("spawnOlaSession: invalid chatId or userId -- refusing to spawn")
    return
  }

  // NOTE: botToken is intentionally excluded from promptMeta to prevent it from
  // appearing in SSH command strings and error logs. The remote script reads the
  // token directly from the environment via Infisical-managed secrets on VPS.
  const promptMeta = JSON.stringify({ chatId: safeChatId, userId: safeUserId, userName, messageText })

  const prompt = [
    `You are Ola, COO agent of Vibe Studio. Process a client message from Telegram bot @vibe_studio_aibot.`,
    ``,
    `Client: ${userName} (userId: ${safeUserId}, chatId: ${safeChatId})`,
    `Message: ${messageText}`,
    ``,
    `INSTRUCTIONS:`,
    `1. Check existing client initiatives:`,
    `   ssh vps 'docker exec pg psql -U vs -d vs -t -c "SELECT id, LEFT(COALESCE(title, \\\"rawIdea\\\"), 100), status FROM \\\"Initiative\\\" WHERE \\\"userId\\\"='"'"'${safeUserId}'"'"' AND status != '"'"'DONE'"'"' ORDER BY \\\"updatedAt\\\" DESC LIMIT 10;"'`,
    ``,
    `2. Determine if the message relates to an existing initiative or is a new idea.`,
    ``,
    `3. If ADDITION to existing initiative:`,
    `   ssh vps 'docker exec pg psql -U vs -d vs -c "INSERT INTO \\\"InitiativeMessage\\\" (id, \\\"initiativeId\\\", type, content, \\\"fromUserId\\\", \\\"createdAt\\\") VALUES (gen_random_uuid()::text, '"'"'INITIATIVE_ID'"'"', '"'"'clarification'"'"', '"'"'TEXT'"'"', '"'"'${safeUserId}'"'"', NOW());"'`,
    `   Reply in the message language: "Added to idea: [title]"`,
    ``,
    `4. If NEW idea:`,
    `   - Create Initiative in DB`,
    `   - Create Task with ticketId TG-YYYYMMDD-NNNN`,
    `   - Break into concrete subtasks (3-7) and create them`,
    `   - Update Initiative status to PLANNED with title and summary`,
    `   Reply in the message language: "New idea created and planned: [title]"`,
    ``,
    `5. ALWAYS reply to client IN THEIR LANGUAGE via curl.`,
    ``,
    `IMPORTANT: Reply in the client's language (Ukrainian -> Ukrainian, English -> English, Spanish -> Spanish).`,
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
    if (err) {
      // Sanitize error before logging: strip any token-like strings from the error
      // message/command to prevent credential leakage into status.error_logs.
      // Patterns: TG bot tokens (digits:base64url), Bearer tokens.
      const sanitizeForLog = (s: string): string =>
        s
          .replace(/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g, "[TG_TOKEN_REDACTED]")
          .replace(/Bearer\s+[A-Za-z0-9_\-.~+/]+=*/gi, "Bearer [REDACTED]")

      const errMessage = sanitizeForLog(err.message ?? "")
      // err may have a .cmd property with full command string — sanitize it too
      const errCmd = (err as NodeJS.ErrnoException & { cmd?: string }).cmd
        ? sanitizeForLog((err as NodeJS.ErrnoException & { cmd?: string }).cmd!)
        : undefined

      console.error("Failed to spawn Ola session:", {
        code: (err as NodeJS.ErrnoException).code,
        message: errMessage,
        ...(errCmd ? { cmd_sanitized: errCmd } : {}),
        sessionId,
        chatId: safeChatId,
      })
    } else {
      console.log(`Ola session ${sessionId} spawned for chat ${safeChatId}`)
    }
  })
}

export async function handleNewIdea(chatId: string, telegramId: string, ideaText: string) {
  const user = await findUserByTelegramId(telegramId)
  if (!user) {
    const m = getBotMessages(null)
    await sendAndSave(chatId, m.accountNotLinked)
    return
  }

  // CLIENT messages go through direct initiative routing
  if (user.role === "CLIENT") {
    await handleClientMessage(chatId, user, ideaText)
    return
  }

  // OWNER messages go to Claude Code (Ola COO agent)
  const m = getBotMessages(user.locale)
  await sendAndSave(chatId, m.olaProcessing)
  spawnOlaSession(chatId, user.id, user.name || user.telegramUsername || "client", ideaText)
}
