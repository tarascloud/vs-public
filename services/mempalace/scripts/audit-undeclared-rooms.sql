-- audit-undeclared-rooms.sql  (REV22-052)
--
-- Finds drawers whose (wing, room) combination is not declared in the
-- palace's wings/rooms tables, and NULL-source drawers.
--
-- USAGE (read-only, safe against prod):
--   ssh vps 'docker exec -i pg psql -U mempalace -d mempalace' < \
--       services/mempalace/scripts/audit-undeclared-rooms.sql
--
-- Or interactively:
--   docker exec -it pg psql -U mempalace -d mempalace -f /path/to/audit-undeclared-rooms.sql
--
-- DO NOT run DML (UPDATE/DELETE) based on this output without a pg_dump backup.
-- See: infra/scripts/mempalace-backup.sh
--
-- Expected output on a healthy palace: 0 rows in every section.
-- Non-zero rows indicate either:
--   a) A new ingester that writes to a wing/room not declared in init_palace.py, OR
--   b) A bug in the scrubber / ingest_store.py that allowed NULL source.
--
-- Reference: CLAUDE.md §MemPalace Wings/Rooms table for declared wings.

\echo '=== 1. Undeclared wing+room combinations ==='
\echo '    (drawers whose wing or room does not appear in the wings/rooms tables)'

SELECT
    d.wing,
    d.room,
    COUNT(*)   AS drawer_count,
    MAX(d.filed_at) AS newest_drawer
FROM drawers d
WHERE NOT EXISTS (
    SELECT 1
    FROM rooms r
    JOIN wings w ON r.wing_id = w.id
    WHERE w.slug = d.wing
      AND r.slug = d.room
)
GROUP BY d.wing, d.room
ORDER BY drawer_count DESC;

\echo ''
\echo '=== 2. Drawers with NULL or empty source field ==='
\echo '    (source must not be NULL; the scrubber sets it from ingest metadata)'

SELECT
    wing,
    room,
    COUNT(*) AS drawer_count,
    MIN(filed_at) AS oldest_drawer,
    MAX(filed_at) AS newest_drawer
FROM drawers
WHERE source IS NULL OR source = ''
GROUP BY wing, room
ORDER BY drawer_count DESC;

\echo ''
\echo '=== 3. Wings declared in wings table but with ZERO drawers ==='
\echo '    (may indicate a wing was declared in init_palace.py but its'
\echo '     ingester never ran or wrote to a different slug)'

SELECT
    w.slug   AS wing_slug,
    w.label  AS wing_label,
    r.slug   AS room_slug,
    r.label  AS room_label
FROM rooms r
JOIN wings w ON r.wing_id = w.id
WHERE NOT EXISTS (
    SELECT 1 FROM drawers d
    WHERE d.wing = w.slug AND d.room = r.slug
)
ORDER BY w.slug, r.slug;

\echo ''
\echo '=== 4. Summary counts per wing ==='

SELECT
    wing,
    room,
    COUNT(*)         AS total_drawers,
    COUNT(CASE WHEN source IS NULL OR source = '' THEN 1 END) AS null_source_count,
    MIN(filed_at)    AS oldest,
    MAX(filed_at)    AS newest
FROM drawers
GROUP BY wing, room
ORDER BY wing, room;
