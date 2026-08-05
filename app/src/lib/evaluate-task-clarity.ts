/**
 * evaluateTaskClarity — shared heuristic extracted from /api/cron/ola-review.
 *
 * REV22-046: moved inline magic-numbers/patterns to a testable lib function
 * so the cron route is just orchestration and the logic is independently
 * verified by unit tests.
 *
 * Returns `{ clear: true }` when the task is formulated clearly enough for
 * execution, or `{ clear: false, issues: string[] }` with a list of human-
 * readable issue descriptions.
 */

/** Minimum word count for an acceptable task title. */
const MIN_TITLE_WORDS = 3;

/** Patterns that indicate a vague single-word title (all word, end of string). */
const VAGUE_TITLE_RE = /^(fix|update|change|do|make|add|remove|test)\s*$/i;

/** Minimum character count for a description to count as "present". */
const MIN_DESCRIPTION_LEN = 10;

export interface TaskClarityInput {
  title: string;
  description: string | null | undefined;
  initiativeTitle?: string | null;
  initiativeRawIdea?: string | null;
}

export type TaskClarityResult =
  | { clear: true }
  | { clear: false; issues: string[] };

/**
 * Evaluate whether a task has sufficient clarity for execution.
 *
 * Rules (as enforced by Ola / COO review cron):
 *  1. Title must have at least MIN_TITLE_WORDS words.
 *  2. Title must not match VAGUE_TITLE_RE (single generic verb).
 *  3. Either a description (>MIN_DESCRIPTION_LEN chars) or initiative context
 *     must be present.
 */
export function evaluateTaskClarity(task: TaskClarityInput): TaskClarityResult {
  const titleWords = task.title.trim().split(/\s+/).length;
  const hasDescription =
    typeof task.description === "string" &&
    task.description.length > MIN_DESCRIPTION_LEN;
  const hasInitiativeContext = !!(task.initiativeTitle || task.initiativeRawIdea);
  const isVague = VAGUE_TITLE_RE.test(task.title.trim());

  const issues: string[] = [];

  if (titleWords < MIN_TITLE_WORDS) {
    issues.push("Title is too short — please provide a more descriptive title");
  }
  if (isVague) {
    issues.push("Title is too vague — specify what exactly needs to be done");
  }
  if (!hasDescription && !hasInitiativeContext) {
    issues.push(
      "No description provided — please add details about what is expected",
    );
  }

  if (issues.length === 0) {
    return { clear: true };
  }
  return { clear: false, issues };
}
