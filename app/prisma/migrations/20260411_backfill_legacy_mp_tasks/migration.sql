-- MP-PROCESS-20260411-01: backfill verificationStatus=SKIPPED for 43 legacy
-- MP-* tasks that were marked DONE before acceptance-criteria enforcement.
-- Already applied manually in production vs DB on 2026-04-11. Kept here so
-- fresh environments (tests, staging) pick up the same state on migrate deploy.

UPDATE "Task"
SET "verificationStatus" = 'SKIPPED'::"VerificationStatus",
    "verifiedAt"         = COALESCE("verifiedAt", NOW()),
    "verificationOutput" = COALESCE(
      "verificationOutput",
      'Legacy MP task backfilled by MP-PROCESS-20260411-01 — acceptance criteria not recorded at creation time.'
    )
WHERE status = 'DONE'
  AND "ticketId" LIKE 'MP-%'
  AND "verificationStatus" IS NULL
  AND "ticketId" <> 'MP-PROCESS-20260411-01';
