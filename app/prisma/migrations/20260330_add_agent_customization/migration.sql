-- AlterTable: add customization columns to Agent
ALTER TABLE "Agent" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "Agent" ADD COLUMN "avatarEmoji" TEXT;
ALTER TABLE "Agent" ADD COLUMN "color" TEXT;
ALTER TABLE "Agent" ADD COLUMN "bio" TEXT;

-- Data migration: set emoji and color per agent
UPDATE "Agent" SET "avatarEmoji" = '🏗️', color = 'from-purple-500 to-violet-600' WHERE name = 'architect';
UPDATE "Agent" SET "avatarEmoji" = '💻', color = 'from-blue-500 to-cyan-600' WHERE name = 'developer';
UPDATE "Agent" SET "avatarEmoji" = '🧪', color = 'from-green-500 to-emerald-600' WHERE name = 'tester';
UPDATE "Agent" SET "avatarEmoji" = '🛡️', color = 'from-orange-500 to-amber-600' WHERE name = 'devsecops';
UPDATE "Agent" SET "avatarEmoji" = '📈', color = 'from-pink-500 to-rose-600' WHERE name = 'trader';
UPDATE "Agent" SET "avatarEmoji" = '📱', color = 'from-teal-500 to-cyan-600' WHERE name = 'smm';
UPDATE "Agent" SET "avatarEmoji" = '👑', color = 'from-indigo-500 to-blue-600' WHERE name = 'coo';
UPDATE "Agent" SET "avatarEmoji" = '🐱', color = 'from-yellow-500 to-amber-600' WHERE name = 'cat';
