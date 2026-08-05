-- Change Task.initiativeId FK from ON DELETE RESTRICT to ON DELETE CASCADE
-- so deleting an Initiative cleanly removes all its Tasks. Task children
-- (Question, TaskQuestion, TaskFeedback, AgentActivity, _TaskDependencies)
-- already have ON DELETE CASCADE on Task, so the cascade chains naturally.
-- This removes the need for the manual $executeRaw cleanup in the
-- DELETE /api/initiatives/[id] handler.

ALTER TABLE "Task" DROP CONSTRAINT "Task_initiativeId_fkey";
ALTER TABLE "Task" ADD CONSTRAINT "Task_initiativeId_fkey"
  FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
