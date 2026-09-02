---
title: "Daily water-temperature checks — rollout runbook"
feature: feat/daily-water-temperature-checks
plan: docs/plans/2026-09-01-001-feat-daily-water-temperature-checks-plan.md
date: 2026-09-01
---

# Daily water-temperature checks — rollout runbook

Covers U7 of the [implementation plan](../plans/2026-09-01-001-feat-daily-water-temperature-checks-plan.md).
This feature records a life-safety compliance obligation. A false green on this
checklist is worse than a documented gap — record what actually ran.

## What ships

| Unit | Commit | Surface |
| --- | --- | --- |
| U1 | `2256002` | `shifts` identity columns, `config.operational_time_zone`, three new tables |
| U2 | `860870d` | Clock-in requires house + slot; freezes operational date/timezone |
| U3 | `681959f` | Authorized write/read API + coarse status endpoint |
| U4 | `ae05c02` | Staff entry dialog + non-dismissible reminder |
| U5 | `5e9f27c` | Supervisor/admin monthly workspace + printable check log |
| U6 | `485cfef` | Read-only inspector month view + identical report |

## Deploy ordering

The schema is **additive and nullable**, so N-1 application code tolerates it.
Deploy in this order, and do not compress steps 1 and 3.

1. **Migrations first.** Apply `drizzle/0011_add_daily_water_temperature_checks.sql`
   and `drizzle/0012_fix_water_temperature_action_required_check.sql`.
   `0012` corrects a constraint in `0011` that would have rejected the
   `action_required` state before corrective action was documented — i.e. it
   blocks the core above-115 °F workflow. **Both must land together.**

   **Prerequisite:** `0011` only *alters* `shifts` and `config` and references
   `locations`; it does not create them. Migrations `0000`–`0010` must already be
   applied to the target database. Running `0011` against an empty database fails
   with `ERROR: 42P01: relation "shifts" does not exist`. Confirm the target
   first:

   ```sql
   select current_database(), current_schema(), current_setting('search_path');
   select table_schema, table_name from information_schema.tables
   where table_name in ('shifts','locations','config') order by 1,2;
   ```

   Zero rows means the database is empty — apply `0000`–`0010` in order first.
   Rows in a non-`public` schema mean `search_path` must be set before running,
   since every migration here is schema-unqualified.

   **Wrap each file in an explicit transaction.** Neither `0011` nor `0012`
   contains `BEGIN`/`COMMIT`, and neither uses `CREATE INDEX CONCURRENTLY`, so
   both are safe to run inside one. This matters: `0011` uses
   `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, but its four
   `ADD CONSTRAINT` statements have no such guard (PostgreSQL has no
   `ADD CONSTRAINT IF NOT EXISTS`). Applied statement-by-statement in an
   autocommit console, a mid-file failure leaves the migration half-applied and
   re-running it then fails on the already-created constraint.

   ```sql
   BEGIN;
   -- paste the full contents of 0011 here
   COMMIT;
   ```

   > `0008` is a pre-existing gap in the migration sequence, not a missing file.

### Tool-driven migrations (preferred)

`drizzle/meta/_journal.json` and a baseline snapshot now exist, so
`npm run db:migrate` can drive migrations instead of hand-pasting SQL.

**A database migrated by hand must be baselined exactly once first.** It has no
`drizzle.__drizzle_migrations` table, so it looks completely un-migrated to
drizzle — and `db:migrate` would attempt `0000_initial_database_schema.sql`, a
full `CREATE TABLE` script, against a populated database.

```bash
npm run db:baseline -- --list                              # tags in journal order
npm run db:baseline -- --through 0010_add_life_safety_reporting_v2
```

Apply that emitted SQL to the target, then run `npm run db:migrate`. Choose
`--through` by **inspecting the database** with the probe above — baselining a
migration that was never actually applied causes drizzle to skip it forever.

How the skip decision works (drizzle-orm 0.44.x): drizzle reads the single most
recent `created_at` from `drizzle.__drizzle_migrations` and applies every journal
entry with a greater `when`. The `hash` column is recorded but never compared,
so a CRLF/LF checkout difference cannot trigger a spurious re-run.

**Caveat on `db:generate`.** The baseline snapshot (`meta/0012_snapshot.json`)
was derived from `db/schema.ts`, not from production. If the hand-applied
migrations ever drifted from `schema.ts`, the first generated migration will
encode that drift. `db:generate` is verified to be a no-op against the current
schema today — but **read every generated migration before applying it**, and do
not use `db:push` against production.
2. **Verify the schema is live** before shipping code that writes to it:
   ```bash
   npm run water-temperature:cutover-report
   ```
3. **Then deploy server + UI.**

### Concurrent index creation

`water_temperature_checks_active_identity_uidx` is the partial unique index that
makes one obligation per `(location, operational_date, shift_slot)` true. If the
production database cannot take the write lock during migration, create it
separately and non-transactionally:

```sql
CREATE UNIQUE INDEX CONCURRENTLY water_temperature_checks_active_identity_uidx
  ON water_temperature_checks (location_id, operational_date, shift_slot)
  WHERE voided_at IS NULL;
```

`CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, and it can
leave an **invalid** index if it fails. The post-deploy check reports index
validity under "Unique index health" — confirm it there before enabling writes.

## Pre-cutover gate

```bash
npm run water-temperature:cutover-report
```

Reports: open legacy shifts missing frozen identity, closed historical shifts
with null identity (permitted), shared and duplicate house/date/slot candidates,
orphan/FK conditions, unique-index health, and organization timezone validity.

**Gate:** do not enforce the new required fields until every *open* legacy shift
is classified. Closed historical shifts may keep null identity forever;
post-cutover writes may not.

Legacy open shifts are classified explicitly, one at a time, through
`POST /api/shifts/current/classify`. **Never backfill a guessed slot or date** —
the endpoint freezes the operational date from the shift's *original* clock-in
timestamp and refuses a second classification via compare-and-swap.

## Monitoring

Sentry is the **only** operational error stream for this feature. Do not add a
second feature-specific telemetry or audit stream — the append-only facts and
reasoned revisions in the database are the canonical audit trail.

Readings and narratives must never reach logs, Sentry, or console output.
Identifiers and status only.

Watch for:

- Unique conflicts on create (expected occasionally — two staff, one obligation)
- Idempotency-key collisions
- `/api/care/water-temperature-status` error rate (drives the reminder; a 500
  must surface as "unable to verify", never as complete)
- Invalid/missing organization timezone (fails clock-in loudly by design)
- Unresolved above-115 °F obligations, aged
- Print failures
- 403/404 rates on authorization boundaries
- Legacy-shift classification counts trending to zero

## Rollback

The rollback path **disables** rather than deletes:

1. Hide the Water Temperature navigation entries and the reminder banner.
2. Stop new writes at the route layer.
3. **Leave the tables and every recorded fact in place and readable.**

Disabling the UI must never delete or rewrite recorded compliance data. The
additive nullable columns mean N-1 code runs unmodified against the new schema,
so a code-only rollback needs no down-migration.

Rotating `INSPECTOR_SESSION_SECRET` immediately invalidates every live inspector
grant if inspector exposure must be cut instantly.

## Post-deploy verification

```bash
npm run water-temperature:post-deploy-check
```

Reports: active obligations by derived state, header version vs. revision chain
consistency, active recheck ordering, unresolved above-115 °F obligations, and
post-cutover clock-ins missing identity in the last 24h.

## Release checklist

Record the real result next to each line. `—` means not run.

| Check | Command | Status |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | ✅ clean |
| Focused suite | `npm run test:water-temperature` | ✅ 192 pass / 0 fail |
| Life-safety regression | `npm run test:life-safety` | ✅ 51 pass / 0 fail |
| Lint | `npx eslint <touched>` | ✅ no new findings |
| Isolated DB migration + concurrency proofs | `npm run test:water-temperature:db` | ❌ **skipped — no database available** |
| Production build | `npm run build` | ✅ compiled successfully; all 6 new routes registered |
| Chromium print preview (Feb + worst-case comments) | manual | ❌ not performed |
| Live OTP inspector session, read-only controls | manual | ❌ not performed |
| Browser matrix: staff / replacement staff / supervisor / inspector | manual | ❌ not performed |

### Known gaps before production enablement

These are **not** optional polish. Each is a place automated review could not
substitute for execution:

1. **Print output has never been rendered.** The one-page fit for 31 rows on
   Letter landscape is asserted structurally (fixed row heights, `break-inside:
   avoid`, `overflow: hidden`, bounded comment text), but the font-metric line
   budget is calculated, not observed. **Open February and a worst-case
   long-comment month in Chromium print/PDF before enabling.**
2. **No live OTP inspector session was exercised.** Field allowlisting is proven
   by a deep-walk assertion over the serialized response, and inspector vs.
   supervisor print HTML is proven byte-identical — but the read-only surface
   was never clicked through.
3. **The database proofs have never executed.** `npm run test:water-temperature:db`
   skipped on every run: this environment has no Docker daemon (Docker Desktop
   is installed but will not start) and no local PostgreSQL. The suite covers
   migration additivity, constraint enforcement, active-identity uniqueness, FK
   behaviour, revision retention, transaction rollback, and the two concurrency
   races. **All of it is unexecuted.** Run it against an isolated database
   before enabling:
   ```bash
   docker run -d --name el-elyon-test-pg -e POSTGRES_PASSWORD=postgres \
     -p 55432:5432 postgres:16-alpine
   WATER_TEMPERATURE_TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:55432/postgres" \
     npm run test:water-temperature:db
   ```
   The suite skips silently by default, which would let a CI job report green
   without running a single proof. Set `WATER_TEMPERATURE_DB_REQUIRED=1` (or
   `CI=true`) to make a missing test database a hard failure instead — verified
   to exit non-zero.
4. **`db.transaction()` does not work in this project.** `db/index.ts` uses
   `drizzle-orm/neon-http`, whose `transaction()` throws unconditionally. Every
   multi-table write in this feature is therefore a **single-statement CTE** or
   a compare-and-swap, which is genuinely atomic in Postgres. Do not "simplify"
   these into `db.transaction()` blocks — they will throw on every request.
   (The pre-existing life-safety mutations *do* call `db.transaction()` and are
   broken; that is tracked separately and is not part of this feature.)

### Deliberate deviations recorded

- **Printed comments are capped at ~290 chars/row** to guarantee one-page fit,
  split across the shifts with content, with a visible `…` marker. The full
  narrative always remains in the digital record. Confirm this is acceptable for
  inspector-facing paper output.
- **Supervisor paper backfills use a `manual-entry` sentinel `staffId`.** A paper
  form has no digital identity for the observing worker; the acting supervisor is
  still recorded as `actorId` on the revision, and the observer's name/initials
  are captured on the entry.
- **No revisions read endpoint exists yet.** The workspace shows the audit trail
  that is reachable — voided predecessors and superseded rechecks — rather than a
  full revision list. A revisions endpoint would be purely additive.
- **The above-115 °F footer's final sentence is partially reconstructed.** The
  source photograph's edge cut off `…Always use a thermometer. Nev—` / `on
  touch.`. It is stored as the single constant
  `ABOVE_115_ESCALATION_INSTRUCTIONS` in
  `src/components/care/waterTemperatureEntryModel.ts` and reused by the entry
  dialog, the supervisor report, and the inspector report. **Confirm the exact
  wording with the customer and correct it in that one place.**
