-- MP-ARCH-FUTURE-03: drop empty KG tables
-- Decision ADR: docs/adr/mempalace-kg-decision-20260411.md
--
-- State at time of drop: kg_entities=0 rows, kg_triples=0 rows.
-- Both tables and all associated indexes/constraints are removed.
-- Revival path (if wiki extractor ships): re-apply pre-FUTURE-03 schema section
-- from git history and create a new migration.

BEGIN;

DROP TABLE IF EXISTS kg_triples;
DROP TABLE IF EXISTS kg_entities;

COMMIT;
