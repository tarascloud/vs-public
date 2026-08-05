-- Add slug column to Project (nullable first for backfill)
ALTER TABLE "Project" ADD COLUMN "slug" TEXT;

-- Backfill existing rows: generate slug from name
-- Lower-case, replace spaces and special chars with hyphens, collapse multiple hyphens
UPDATE "Project"
SET "slug" = regexp_replace(
    regexp_replace(
      lower("name"),
      '[^a-z0-9]+', '-', 'g'
    ),
    '(^-+|-+$)', '', 'g'
  );

-- Make slug NOT NULL and add UNIQUE constraint
ALTER TABLE "Project" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
