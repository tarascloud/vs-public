export type BotLocale = "en" | "uk" | "es"

interface BotMessages {
  welcome: (name: string) => string
  welcomeBack: (name: string) => string
  welcomeUnknown: string
  accountLinked: (name: string) => string
  accountNotLinked: string
  noProjects: string
  statusHeader: (count: number) => string
  statusProject: (name: string, total: number, done: number, inProgress: number) => string
  tasksHeader: string
  tasksEmpty: string
  taskItem: (ticketId: string, title: string, status: string) => string
  taskStatusTodo: string
  taskStatusInProgress: string
  taskStatusBlocked: string
  taskStatusTesting: string
  taskStatusDone: string
  questionCreated: (ticketId: string) => string
  ideaCreated: (ticketId: string) => string
  helpText: string
  notifyTaskStatus: (title: string, status: string) => string
  notifyQuestion: (title: string, question: string) => string
  notifyFeedbackNeeded: (title: string) => string
  replyToAnswer: string
  answerRecorded: string
  initiativeNotFound: string
  errorGeneric: string
  ideaAppended: (title: string) => string
  olaProcessing: string
  // Client routing messages
  clientMessageAdded: (title: string) => string
  clientSelectInitiative: string
  clientNewInitiativeCreated: (title: string) => string
  clientFileReceived: string
  clientFileAdded: (title: string) => string
}

const messages: Record<BotLocale, BotMessages> = {
  en: {
    welcome: (name) =>
      `Hey ${name}! 👋 I'm <b>Ola</b>, COO at Vibe Studio.\n\n` +
      `Your account is linked and you're all set! Here's what I can help with:\n\n` +
      `📊 /status — check project progress\n` +
      `📋 /tasks — see your task list\n` +
      `❓ /question [text] — ask me anything\n\n` +
      `Or just send a message with your idea — I'll turn it into a task for the team.`,

    welcomeBack: (name) =>
      `Welcome back, <b>${name}</b>! 👋\n\nIt's Ola. How can I help today?\n\n` +
      `📊 /status — project progress\n` +
      `📋 /tasks — your task list\n` +
      `❓ /question [text] — ask me anything`,

    welcomeUnknown:
      `Hey there! 👋 I'm <b>Ola</b>, COO at <b>Vibe Studio</b> — your AI-powered development team.\n\n` +
      `Here's how we work:\n` +
      `1️⃣ You share an idea or task — just type it here\n` +
      `2️⃣ Our team of AI agents plans, builds, and tests it\n` +
      `3️⃣ You get updates and can ask questions anytime\n\n` +
      `To get started, ask your project manager for a link token at vibe-studio.example.com, ` +
      `then send: <code>/start YOUR_TOKEN</code>\n\n` +
      `Questions? Just ask! 😊`,

    accountLinked: (name) =>
      `Your Telegram account has been linked to <b>${name}</b>'s profile. ` +
      `You'll now receive project updates here.`,

    accountNotLinked:
      `Your account is not linked. Ask your project manager for a link token ` +
      `and send it as: <code>/start YOUR_TOKEN</code>`,

    noProjects: `You have no active projects at the moment.`,

    statusHeader: (count) => `<b>Your projects (${count}):</b>\n`,

    statusProject: (name, total, done, inProgress) =>
      `<b>${name}</b>\n` +
      `  Tasks: ${total} total, ${done} done, ${inProgress} in progress\n`,

    tasksHeader: `<b>Your tasks:</b>\n`,
    tasksEmpty: `No tasks assigned to your projects at the moment.`,

    taskItem: (ticketId, title, status) => `• <code>${ticketId}</code> ${title} — ${status}`,

    taskStatusTodo: "To Do",
    taskStatusInProgress: "In Progress",
    taskStatusBlocked: "Blocked",
    taskStatusTesting: "Testing",
    taskStatusDone: "Done",

    questionCreated: (ticketId) =>
      `Got it! I've logged your question (ticket <code>${ticketId}</code>). I'll get back to you shortly. 👍`,

    ideaCreated: (ticketId) =>
      `Great idea! 💡 Logged as <code>${ticketId}</code>. The team will review it and I'll keep you updated.`,

    helpText:
      `<b>Hi! I'm Ola, COO at Vibe Studio</b> 👋\n\n` +
      `Here's what I can do:\n\n` +
      `📊 /status — project progress\n` +
      `📋 /tasks — your task list\n` +
      `❓ /question [text] — ask me anything\n\n` +
      `Or just send a message — I'll create a task from it.`,

    notifyTaskStatus: (title, status) =>
      `<b>Status update:</b> \u2018${title}\u2019 is now <b>${status}</b>`,

    notifyQuestion: (title, question) =>
      `<b>Question</b> about \u2018${title}\u2019:\n\n${question}\n\nReply to this message to answer.`,

    notifyFeedbackNeeded: (title) =>
      `<b>Review needed:</b> Task \u2018${title}\u2019 is ready for your feedback. Please check and approve.`,

    replyToAnswer: `Your answer has been recorded. Thank you!`,
    answerRecorded: `Answer saved.`,
    initiativeNotFound: `Could not find that task. Please send a new message.`,
    errorGeneric: `Something went wrong. Please try again later.`,
    ideaAppended: (title) => `Added to existing idea: ${title}`,
    olaProcessing: `🤔 Analyzing your message...`,
    clientMessageAdded: (title) => `Your message has been added to the initiative: <b>${title}</b>. Follow progress at vibe-studio.example.com`,
    clientSelectInitiative: `You have several active initiatives. Which one is this message about?`,
    clientNewInitiativeCreated: (title) => `New initiative created: <b>${title}</b>. The team will review it shortly. Follow progress at vibe-studio.example.com`,
    clientFileReceived: `File received and attached to your initiative.`,
    clientFileAdded: (title) => `File attached to initiative: <b>${title}</b>`,
  },

  uk: {
    welcome: (name) =>
      `Привіт, ${name}! 👋 Я — <b>Ола</b>, COO у Vibe Studio.\n\n` +
      `Акаунт підключено, все готово! Ось що я можу:\n\n` +
      `📊 /status — прогрес проектів\n` +
      `📋 /tasks — список задач\n` +
      `❓ /question [текст] — запитай мене\n\n` +
      `Або просто напиши свою ідею — я створю задачу для команди.`,

    welcomeBack: (name) =>
      `З поверненням, <b>${name}</b>! 👋\n\nЦе Ола. Чим можу допомогти?\n\n` +
      `📊 /status — прогрес проектів\n` +
      `📋 /tasks — список задач\n` +
      `❓ /question [текст] — запитай мене`,

    welcomeUnknown:
      `Привіт! 👋 Я — <b>Ола</b>, COO у <b>Vibe Studio</b> — твоя AI-команда розробки.\n\n` +
      `Як це працює:\n` +
      `1️⃣ Ти надсилаєш ідею чи задачу — просто напиши сюди\n` +
      `2️⃣ Команда AI-агентів планує, розробляє і тестує\n` +
      `3️⃣ Ти отримуєш оновлення і можеш ставити питання\n\n` +
      `Щоб почати, попроси менеджера проекту дати токен на vibe-studio.example.com, ` +
      `потім надішли: <code>/start ТВІЙ_ТОКЕН</code>\n\n` +
      `Є питання? Просто пиши! 😊`,

    accountLinked: (name) =>
      `Telegram-акаунт підключено до профілю <b>${name}</b>. ` +
      `Ви будете отримувати оновлення проектів тут.`,

    accountNotLinked:
      `Ваш акаунт не підключено. Попросіть менеджера про токен ` +
      `і надішліть: <code>/start ВАШ_ТОКЕН</code>`,

    noProjects: `У вас поки немає активних проектів.`,

    statusHeader: (count) => `<b>Ваші проекти (${count}):</b>\n`,

    statusProject: (name, total, done, inProgress) =>
      `<b>${name}</b>\n` +
      `  Задачі: ${total} всього, ${done} виконано, ${inProgress} в роботі\n`,

    tasksHeader: `<b>Ваші задачі:</b>\n`,
    tasksEmpty: `Наразі немає задач у ваших проектах.`,

    taskItem: (ticketId, title, status) => `• <code>${ticketId}</code> ${title} — ${status}`,

    taskStatusTodo: "До виконання",
    taskStatusInProgress: "В роботі",
    taskStatusBlocked: "Заблоковано",
    taskStatusTesting: "Тестування",
    taskStatusDone: "Виконано",

    questionCreated: (ticketId) =>
      `Прийняла! Записала питання (тікет <code>${ticketId}</code>). Відповім найближчим часом. 👍`,

    ideaCreated: (ticketId) =>
      `Класна ідея! 💡 Записала як <code>${ticketId}</code>. Команда розгляне і я тримаю тебе в курсі.`,

    helpText:
      `<b>Привіт! Я Ола, COO Vibe Studio</b> 👋\n\n` +
      `Ось що я можу:\n\n` +
      `📊 /status — прогрес проектів\n` +
      `📋 /tasks — список задач\n` +
      `❓ /question [текст] — запитай мене\n\n` +
      `Або просто напиши — я створю задачу.`,

    notifyTaskStatus: (title, status) =>
      `<b>Зміна статусу:</b> \u2018${title}\u2019 — тепер <b>${status}</b>`,

    notifyQuestion: (title, question) =>
      `<b>Питання</b> щодо \u2018${title}\u2019:\n\n${question}\n\nВідповідайте на це повідомлення.`,

    notifyFeedbackNeeded: (title) =>
      `<b>Потрібен відгук:</b> Задача \u2018${title}\u2019 готова до перевірки. Будь ласка, перегляньте та підтвердьте.`,

    replyToAnswer: `Вашу відповідь збережено. Дякуємо!`,
    answerRecorded: `Відповідь збережено.`,
    initiativeNotFound: `Не вдалося знайти цю задачу. Надішліть нове повідомлення.`,
    errorGeneric: `Щось пішло не так. Спробуйте пізніше.`,
    ideaAppended: (title) => `Додано до існуючої ідеї: ${title}`,
    olaProcessing: `🤔 Аналізую ваше повідомлення...`,
    clientMessageAdded: (title) => `Ваше повідомлення додано до ініціативи: <b>${title}</b>. Слідкуйте за прогресом на vibe-studio.example.com`,
    clientSelectInitiative: `У вас кілька активних ініціатив. До якої стосується це повідомлення?`,
    clientNewInitiativeCreated: (title) => `Нова ініціатива створена: <b>${title}</b>. Команда розгляне її найближчим часом. Слідкуйте за прогресом на vibe-studio.example.com`,
    clientFileReceived: `Файл отримано та додано до ініціативи.`,
    clientFileAdded: (title) => `Файл додано до ініціативи: <b>${title}</b>`,
  },

  es: {
    welcome: (name) =>
      `¡Hola ${name}! 👋 Soy <b>Ola</b>, COO de Vibe Studio.\n\n` +
      `Tu cuenta está vinculada. Esto es lo que puedo hacer:\n\n` +
      `📊 /status — progreso de proyectos\n` +
      `📋 /tasks — tu lista de tareas\n` +
      `❓ /question [texto] — pregúntame lo que quieras\n\n` +
      `O simplemente envía un mensaje con tu idea — crearé una tarea para el equipo.`,

    welcomeBack: (name) =>
      `¡Bienvenido de vuelta, <b>${name}</b>! 👋\n\nSoy Ola. ¿En qué te puedo ayudar?\n\n` +
      `📊 /status — progreso de proyectos\n` +
      `📋 /tasks — tu lista de tareas\n` +
      `❓ /question [texto] — pregúntame lo que quieras`,

    welcomeUnknown:
      `¡Hola! 👋 Soy <b>Ola</b>, COO de <b>Vibe Studio</b> — tu equipo de desarrollo con IA.\n\n` +
      `Así es como funciona:\n` +
      `1️⃣ Comparte una idea o tarea — solo escríbela aquí\n` +
      `2️⃣ Nuestro equipo de agentes IA planifica, desarrolla y prueba\n` +
      `3️⃣ Recibes actualizaciones y puedes hacer preguntas en cualquier momento\n\n` +
      `Para empezar, pide a tu project manager un token en vibe-studio.example.com, ` +
      `y envía: <code>/start TU_TOKEN</code>\n\n` +
      `¿Preguntas? ¡Solo escribe! 😊`,

    accountLinked: (name) =>
      `Tu cuenta de Telegram está vinculada al perfil de <b>${name}</b>. ` +
      `Recibirás actualizaciones de proyectos aquí.`,

    accountNotLinked:
      `Tu cuenta no está vinculada. Pide un token a tu project manager ` +
      `y envía: <code>/start TU_TOKEN</code>`,

    noProjects: `No tienes proyectos activos en este momento.`,

    statusHeader: (count) => `<b>Tus proyectos (${count}):</b>\n`,

    statusProject: (name, total, done, inProgress) =>
      `<b>${name}</b>\n` +
      `  Tareas: ${total} total, ${done} completadas, ${inProgress} en progreso\n`,

    tasksHeader: `<b>Tus tareas:</b>\n`,
    tasksEmpty: `No hay tareas asignadas a tus proyectos en este momento.`,

    taskItem: (ticketId, title, status) => `• <code>${ticketId}</code> ${title} — ${status}`,

    taskStatusTodo: "Pendiente",
    taskStatusInProgress: "En progreso",
    taskStatusBlocked: "Bloqueada",
    taskStatusTesting: "En pruebas",
    taskStatusDone: "Completada",

    questionCreated: (ticketId) =>
      `¡Recibido! He registrado tu pregunta (ticket <code>${ticketId}</code>). Te responderé pronto. 👍`,

    ideaCreated: (ticketId) =>
      `¡Buena idea! 💡 Registrada como <code>${ticketId}</code>. El equipo la revisará y te mantendré informado.`,

    helpText:
      `<b>¡Hola! Soy Ola, COO de Vibe Studio</b> 👋\n\n` +
      `Esto es lo que puedo hacer:\n\n` +
      `📊 /status — progreso de proyectos\n` +
      `📋 /tasks — tu lista de tareas\n` +
      `❓ /question [texto] — pregúntame lo que quieras\n\n` +
      `O simplemente escribe — crearé una tarea.`,

    notifyTaskStatus: (title, status) =>
      `<b>Cambio de estado:</b> \u2018${title}\u2019 ahora es <b>${status}</b>`,

    notifyQuestion: (title, question) =>
      `<b>Pregunta</b> sobre \u2018${title}\u2019:\n\n${question}\n\nResponde a este mensaje.`,

    notifyFeedbackNeeded: (title) =>
      `<b>Revisión necesaria:</b> La tarea \u2018${title}\u2019 está lista para tu revisión. Por favor, revisa y aprueba.`,

    replyToAnswer: `Tu respuesta ha sido guardada. ¡Gracias!`,
    answerRecorded: `Respuesta guardada.`,
    initiativeNotFound: `No se encontró esa tarea. Envía un nuevo mensaje.`,
    errorGeneric: `Algo salió mal. Inténtalo más tarde.`,
    ideaAppended: (title) => `Agregado a una idea existente: ${title}`,
    olaProcessing: `🤔 Analizando tu mensaje...`,
    clientMessageAdded: (title) => `Tu mensaje ha sido agregado a la iniciativa: <b>${title}</b>. Sigue el progreso en vibe-studio.example.com`,
    clientSelectInitiative: `Tienes varias iniciativas activas. ¿A cuál se refiere este mensaje?`,
    clientNewInitiativeCreated: (title) => `Nueva iniciativa creada: <b>${title}</b>. El equipo la revisará pronto. Sigue el progreso en vibe-studio.example.com`,
    clientFileReceived: `Archivo recibido y adjuntado a tu iniciativa.`,
    clientFileAdded: (title) => `Archivo adjuntado a la iniciativa: <b>${title}</b>`,
  },
}

export function getBotMessages(locale: string | null | undefined): BotMessages {
  const raw = locale ?? "en"
  const l = (raw === "uk" || raw === "es" ? raw : raw.startsWith("es") ? "es" : raw.startsWith("uk") ? "uk" : "en") as BotLocale
  return messages[l] ?? messages.en
}

export function getTaskStatusLabel(status: string, locale: string | null | undefined): string {
  const m = getBotMessages(locale)
  switch (status) {
    case "TODO": return m.taskStatusTodo
    case "IN_PROGRESS": return m.taskStatusInProgress
    case "BLOCKED": return m.taskStatusBlocked
    case "TESTING": return m.taskStatusTesting
    case "DONE": return m.taskStatusDone
    default: return status
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
