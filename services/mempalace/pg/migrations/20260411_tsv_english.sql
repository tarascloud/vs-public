-- MP-C-08-TSVCONFIG: switch content_tsv from simple-only to english+simple hybrid
-- Rationale: simple config has no stemming. english gives stemming for ASCII tokens
-- (users→user, security→secur). Concatenating with simple preserves Ukrainian tokens
-- (simple tokenizer treats Cyrillic as words without stemming).
--
-- Rollback: re-create column with to_tsvector('simple', content).

BEGIN;

ALTER TABLE drawers DROP COLUMN content_tsv;

ALTER TABLE drawers ADD COLUMN content_tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('english', content) || to_tsvector('simple', content)
) STORED;

DROP INDEX IF EXISTS drawers_content_tsv_gin;
CREATE INDEX drawers_content_tsv_gin ON drawers USING gin (content_tsv);

COMMIT;
