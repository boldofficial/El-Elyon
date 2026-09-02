-- Seed a config row so the organization operational timezone is readable.
--
-- 0011 added config.operational_time_zone as NOT NULL DEFAULT 'America/Chicago'.
-- A column default only backfills rows that EXIST, so an installation whose
-- `config` table was never populated has nothing to read: getOperationalTimeZone
-- (db/queries/care.ts) does `config.findFirst()`, gets undefined, and throws
-- InvalidOperationalTimeZoneConfigError. Clock-in then fails with "The
-- organization operational time zone is not configured correctly."
--
-- Failing rather than falling back to a browser or database timezone is
-- deliberate (R2/KTD2): a wrong operational date silently misfiles a
-- compliance obligation. The defect is that a fresh installation has no config
-- row at all, which makes clock-in impossible out of the box.
--
-- Idempotent: inserts only when the table is empty, so it is safe to re-run and
-- never disturbs an installation that already configured a timezone.

INSERT INTO "config" ("operational_time_zone")
SELECT 'America/Chicago'
WHERE NOT EXISTS (SELECT 1 FROM "config");
