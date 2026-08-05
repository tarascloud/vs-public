import fs from "fs/promises";
import path from "path";

interface AgentData {
  name: string;
  displayName: string;
  description: string;
  role: string;
  instructions: string;
  tools: string[];
  model: string;
}

const AGENTS_DIR =
  process.env.AGENTS_DIR || "/opt/repos/vibe-studio/agents";

const TASKS_FOOTER = (name: string) => `### Робота з задачами
Задачі управляються через Vibe Studio API (vibe-studio.example.com):
- **Отримати свої задачі:** \`GET https://vibe-studio.example.com/api/tasks?assigneeType=AGENT&agentName=${name}\`
- **Оновити статус:** \`PUT https://vibe-studio.example.com/api/tasks/{id}\` з \`{ "status": "IN_PROGRESS" }\` / \`{ "status": "DONE" }\`
- **Перед початком роботи:** змінити статус задачі на IN_PROGRESS
- **Після завершення:** змінити статус на DONE
- **Типи задач:** FEATURE (нова фіча), BUG (виправлення), CHORE (технічне), REVIEW (перевірка)
- **При створенні задачі:** вказувати type: \`{ "type": "BUG" }\` або \`{ "type": "FEATURE" }\`
- **При завершенні:** додати completionNote, commitHash: \`{ "status": "DONE", "completionNote": "...", "commitHash": "abc1234" }\`
- **tokensUsed:** НЕ встановлювати самому — координатор (COO/головна сесія) автоматично додасть після завершення агента
- **Якщо заблоковано:** змінити статус на BLOCKED
- **Перевірити dependencies:** якщо задача має blockedBy задачі що не DONE — не починати роботу`;

/**
 * Оновлює .md файл агента даними з БД.
 *
 * Стратегія — точкові заміни, НЕ перезапис усього файлу:
 * 1. Frontmatter: оновити description та model
 * 2. ## Role секція: замінити текст між "## Role" і наступною "## " секцією
 * 3. ## Instructions: замінити перший абзац (до першої "### " підсекції) — це "instructions" з БД
 *    Кастомні підсекції (### ...) і ## Projects залишаються незмінними.
 *
 * Якщо файл не існує — генерується новий з нуля зі стандартним footer.
 */
// Strict slug: lowercase letter start, then lowercase letters/digits/_/-
// Prevents path traversal (../), absolute paths, NUL bytes, hidden files (.foo).
const AGENT_NAME_RE = /^[a-z][a-z0-9_-]{0,63}$/;

export async function syncAgentToFile(agent: AgentData): Promise<void> {
  if (!AGENT_NAME_RE.test(agent.name)) {
    throw new Error(
      `Invalid agent name: ${JSON.stringify(agent.name)}. ` +
        `Must match ${AGENT_NAME_RE} (lowercase letter start, <=64 chars, a-z0-9_-).`,
    );
  }

  const filePath = path.resolve(AGENTS_DIR, `${agent.name}.md`);
  const baseDir = path.resolve(AGENTS_DIR) + path.sep;
  if (!filePath.startsWith(baseDir)) {
    throw new Error(
      `Refusing to write outside AGENTS_DIR: ${filePath} not under ${baseDir}`,
    );
  }

  let existing: string | null = null;
  try {
    existing = await fs.readFile(filePath, "utf-8");
  } catch {
    // Файл не існує
  }

  let newContent: string;
  if (existing === null) {
    newContent = buildNewFile(agent);
  } else {
    newContent = updateExistingFile(existing, agent);
  }

  await fs.writeFile(filePath, newContent, "utf-8");
}

/**
 * Генерує новий .md файл агента з нуля.
 * Використовується коли файл не існує.
 */
function buildNewFile(agent: AgentData): string {
  const toolsList = `[${agent.tools.join(", ")}]`;

  return `---
name: ${agent.name}
description: "${agent.description}"
subagent_type: ${agent.name}
model: ${agent.model}
tools: ${toolsList}
---

# ${agent.displayName}

## Role
${agent.role}

## Instructions

### Перед початком роботи
1. Отримай свої задачі: \`GET https://vibe-studio.example.com/api/tasks?assigneeType=AGENT&agentName=${agent.name}\`

${TASKS_FOOTER(agent.name)}

## Projects
Всі проекти VS: PD, JobFinder, Status, Trade, Website, Cloudflare, VS, Mail.
`;
}

/**
 * Оновлює існуючий .md файл — точкові заміни:
 * - frontmatter description та model
 * - ## Role секція
 * - ## Instructions (тільки перший абзац до першої ### підсекції)
 */
function updateExistingFile(content: string, agent: AgentData): string {
  let result = content;

  // 1. Оновити frontmatter description
  result = result.replace(
    /^description:\s*".*?"$/m,
    `description: "${agent.description.replace(/"/g, '\\"')}"`
  );

  // 2. Оновити frontmatter model
  result = result.replace(/^model:\s*.+$/m, `model: ${agent.model}`);

  // 3. Оновити ## Role секцію
  // Знайти блок від "## Role\n" до наступної "## " секції
  result = replaceSectionContent(result, "## Role", agent.role);

  // 4. Оновити ## Instructions (тільки перший текстовий блок до першої ### підсекції)
  // instructions з БД — це той текст що йде одразу після "## Instructions\n\n"
  // до першої "### Перед початком роботи" або іншої ### підсекції
  // Якщо instructions з БД вже містить підсекції ### — замінити весь блок до ## Projects/кінця
  result = updateInstructionsSection(result, agent);

  return result;
}

/**
 * Замінює вміст секції між "## SectionName\n" і наступною "## " або кінцем файлу.
 * Зберігає порожній рядок після заголовку і перед наступною секцією.
 */
function replaceSectionContent(
  content: string,
  sectionHeader: string,
  newBody: string
): string {
  // Regex: знайти "## Role\n" + все до наступного "## " або кінця файлу
  const escapedHeader = sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `(${escapedHeader}\\n)([\\s\\S]*?)(?=\\n## |$)`,
    "m"
  );

  return content.replace(regex, (_match, header) => {
    return `${header}${newBody.trim()}\n`;
  });
}

/**
 * Оновлює секцію ## Instructions:
 * - Якщо instructions з БД НЕ містить ### — вони є "вступним текстом" секції.
 *   Замінюємо текст між "## Instructions\n" і першою "### " підсекцією.
 * - Якщо instructions з БД містить ### — замінюємо весь вміст Instructions
 *   але зберігаємо "### Робота з задачами" якщо він вже є в файлі.
 */
function updateInstructionsSection(content: string, agent: AgentData): string {
  const instructionsMatch = content.match(/\n## Instructions\n/);
  if (!instructionsMatch || instructionsMatch.index === undefined) {
    return content;
  }

  const sectionStart = instructionsMatch.index + instructionsMatch[0].length;

  // Знайти наступну ## секцію (не ###) після ## Instructions
  const afterInstructions = content.slice(sectionStart);

  // Знайти першу ### підсекцію в секції Instructions
  const firstSubsectionMatch = afterInstructions.match(/\n### /);

  if (!firstSubsectionMatch || firstSubsectionMatch.index === undefined) {
    // Немає підсекцій — замінити весь вміст до наступної ## або кінця
    const nextSectionMatch = afterInstructions.match(/\n## /);
    if (nextSectionMatch && nextSectionMatch.index !== undefined) {
      const before = content.slice(0, sectionStart);
      const after = content.slice(sectionStart + nextSectionMatch.index);
      return `${before}\n${agent.instructions.trim()}\n${after}`;
    } else {
      const before = content.slice(0, sectionStart);
      return `${before}\n${agent.instructions.trim()}\n`;
    }
  } else {
    // Є підсекції — замінити тільки текст між "## Instructions\n" і першою "### "
    const introEnd = sectionStart + firstSubsectionMatch.index;
    const introText = agent.instructions.trim();

    // Якщо instructions з БД не містить ### — це вступний текст
    if (!introText.includes("###")) {
      const before = content.slice(0, sectionStart);
      const after = content.slice(introEnd);
      const newIntro = introText ? `\n${introText}\n` : "\n";
      return `${before}${newIntro}${after}`;
    } else {
      // instructions містить ### підсекції — замінюємо весь вміст Instructions
      // але зберігаємо "### Робота з задачами" блок якщо він є
      const existingTasksFooterMatch = afterInstructions.match(
        /\n### Робота з задачами\n[\s\S]*?(?=\n## |$)/
      );
      const nextSectionMatch = afterInstructions.match(/\n## /);

      const preservedTasksBlock = existingTasksFooterMatch
        ? existingTasksFooterMatch[0].trim()
        : TASKS_FOOTER(agent.name);

      const before = content.slice(0, sectionStart);
      const afterSection = nextSectionMatch?.index !== undefined
        ? content.slice(sectionStart + nextSectionMatch.index)
        : "";

      return `${before}\n${introText}\n\n${preservedTasksBlock}\n${afterSection}`;
    }
  }
}
