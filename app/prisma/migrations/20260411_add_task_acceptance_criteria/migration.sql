-- MP-PROCESS-20260411-01: machine-verifiable acceptance criteria for Task
-- Safe online migration: all new columns nullable, new enum additive.

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PASS', 'FAIL', 'SKIPPED', 'NO_RUNTIME', 'NO_GIT');

-- AlterTable
ALTER TABLE "Task"
  ADD COLUMN "acceptanceCriteria"  TEXT,
  ADD COLUMN "verificationCommand" TEXT,
  ADD COLUMN "verificationOutput"  TEXT,
  ADD COLUMN "verifiedAt"          TIMESTAMP(3),
  ADD COLUMN "verificationStatus"  "VerificationStatus";
