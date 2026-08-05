-- CreateEnum
CREATE TYPE "AssigneeType" AS ENUM ('AGENT', 'OWNER', 'CLIENT');

-- AlterTable: add assignee columns to Task
ALTER TABLE "Task" ADD COLUMN "assigneeType" "AssigneeType" NOT NULL DEFAULT 'AGENT';
ALTER TABLE "Task" ADD COLUMN "assigneeUserId" TEXT;

-- AddForeignKey: Task.assigneeUserId -> User.id
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: TaskDependencies (self-referential many-to-many)
CREATE TABLE "_TaskDependencies" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_TaskDependencies_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_TaskDependencies_B_index" ON "_TaskDependencies"("B");

-- AddForeignKey
ALTER TABLE "_TaskDependencies" ADD CONSTRAINT "_TaskDependencies_A_fkey" FOREIGN KEY ("A") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskDependencies" ADD CONSTRAINT "_TaskDependencies_B_fkey" FOREIGN KEY ("B") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
