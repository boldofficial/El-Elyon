/**
 * Water-temperature rollout checks (Unit U7).
 *
 * Two read-only report modes, run against a database connection string:
 *
 *   npm run water-temperature:cutover-report      -- BEFORE enabling new-field
 *                                                    enforcement on clock-in
 *   npm run water-temperature:post-deploy-check   -- AFTER the server/UI deploy
 *
 * Both are strictly read-only: they issue SELECTs only and never write, so they
 * are safe to run against production. Connection string resolution order:
 *   1. `--database-url=...` argument
 *   2. `WATER_TEMPERATURE_ROLLOUT_DATABASE_URL`
 *   3. `DATABASE_URL`
 *
 * Uses `pg` directly rather than the application's drizzle singleton: the
 * production client is drizzle-orm/neon-http, which speaks Neon's HTTP wire
 * protocol and cannot target a plain/dockerized Postgres. Operators must be
 * able to run these against a staging restore or the isolated test database.
 *
 * OUTPUT PRIVACY: this script prints counts, identifiers, dates and slots only.
 * It never selects `kitchen_temp_tenths`, `bath_temp_tenths`, `comments`,
 * `action`, `void_reason`, or any revision snapshot -- readings and narratives
 * must not reach operational console output (see the plan's System-Wide Impact
 * section). Reviewers changing this file must preserve that property.
 *
 * Exit codes: 0 = clear to proceed, 1 = blocking findings, 2 = script error.
 */

import { Pool, type PoolClient } from "pg";

type Mode = "pre-cutover" | "post-deploy";

type Finding = {
	readonly severity: "block" | "warn" | "info";
	readonly label: string;
	readonly detail: string;
	readonly rows?: ReadonlyArray<Record<string, unknown>>;
};

async function main(): Promise<number> {
	const argv = process.argv.slice(2);
	const mode = argv.find((a) => !a.startsWith("--")) as Mode | undefined;
	if (mode !== "pre-cutover" && mode !== "post-deploy") {
		console.error(
			"Usage: tsx scripts/water-temperature-rollout-check.ts <pre-cutover|post-deploy> [--database-url=...]"
		);
		return 2;
	}

	const explicit = argv.find((a) => a.startsWith("--database-url="))?.slice("--database-url=".length);
	const connectionString =
		explicit ||
		process.env.WATER_TEMPERATURE_ROLLOUT_DATABASE_URL ||
		process.env.DATABASE_URL;
	if (!connectionString) {
		console.error(
			"No connection string. Pass --database-url=..., or set WATER_TEMPERATURE_ROLLOUT_DATABASE_URL or DATABASE_URL."
		);
		return 2;
	}

	const pool = new Pool({ connectionString, max: 1 });
	try {
		const client = await pool.connect();
		try {
			const findings =
				mode === "pre-cutover"
					? await preCutoverFindings(client)
					: await postDeployFindings(client);
			return report(mode, findings);
		} finally {
			client.release();
		}
	} finally {
		await pool.end();
	}
}

// ============================================================================
// PRE-CUTOVER
//
// Answers one question: can new-field enforcement be turned on without
// stranding anybody? Every OPEN legacy shift must have been classified through
// /api/shifts/current/classify first. Closed historical shifts may keep null
// identity forever -- they anchor no future obligation. Post-cutover writes may
// not.
// ============================================================================

async function preCutoverFindings(client: PoolClient): Promise<Finding[]> {
	const findings: Finding[] = [];

	if (!(await tableExists(client, "water_temperature_checks"))) {
		findings.push({
			severity: "block",
			label: "Schema migration not applied",
			detail:
				"water_temperature_checks is absent. Apply drizzle/0011 and drizzle/0012 before cutover.",
		});
		return findings;
	}
	if (!(await columnExists(client, "shifts", "location_id"))) {
		findings.push({
			severity: "block",
			label: "Shift identity columns not applied",
			detail: "shifts.location_id is absent. Apply drizzle/0011 before cutover.",
		});
		return findings;
	}

	// 1. Open shifts still missing frozen identity -- the cutover blocker.
	const openUnclassified = await client.query<{
		id: string;
		clerk_user_id: string | null;
		location: string | null;
		clock_in_time: Date;
	}>(
		`SELECT id, clerk_user_id, location, clock_in_time
		   FROM shifts
		  WHERE clock_out_time IS NULL
		    AND (location_id IS NULL OR shift_slot IS NULL OR operational_date IS NULL
		         OR operational_time_zone_snapshot IS NULL)
		  ORDER BY clock_in_time
		  LIMIT 500`
	);
	findings.push({
		severity: openUnclassified.rowCount ? "block" : "info",
		label: "Open legacy shifts missing frozen identity",
		detail: openUnclassified.rowCount
			? `${openUnclassified.rowCount} open shift(s) still unclassified. Each must complete the one-time /api/shifts/current/classify flow. Do NOT backfill a guessed slot or date.`
			: "0 -- every open shift carries a location, slot, operational date, and timezone snapshot.",
		rows: openUnclassified.rows,
	});

	// 2. Closed shifts missing identity -- expected and permitted; reported for
	//    awareness only, so nobody mistakes the count for a defect.
	const closedUnclassified = await client.query<{ count: string }>(
		`SELECT count(*)::text AS count
		   FROM shifts
		  WHERE clock_out_time IS NOT NULL AND location_id IS NULL`
	);
	findings.push({
		severity: "info",
		label: "Closed historical shifts with null identity (permitted)",
		detail: `${closedUnclassified.rows[0].count} closed shift(s) keep null identity. This is expected and correct: they anchor no future obligation and must not be backfilled.`,
	});

	// 3. Duplicate candidate house/date/slot among OPEN classified shifts.
	//    Several workers legitimately share one slot -- the obligation is shared,
	//    not per-employee -- so this is informational. It becomes actionable only
	//    if paired with more than one non-voided check for the same identity.
	const duplicateCandidates = await client.query(
		`SELECT location_id, operational_date, shift_slot, count(*)::int AS open_shifts
		   FROM shifts
		  WHERE clock_out_time IS NULL AND location_id IS NOT NULL
		  GROUP BY location_id, operational_date, shift_slot
		 HAVING count(*) > 1
		  ORDER BY count(*) DESC
		  LIMIT 100`
	);
	findings.push({
		severity: "info",
		label: "Shared house/date/slot among open shifts",
		detail: duplicateCandidates.rowCount
			? `${duplicateCandidates.rowCount} identity/identities have multiple concurrently open shifts. Expected: one obligation is shared by everyone working that slot.`
			: "0 -- no house/date/slot currently has more than one open shift.",
		rows: duplicateCandidates.rows,
	});

	// 4. Hard blocker: more than one ACTIVE check per identity would mean the
	//    partial unique index is missing or was created invalid.
	const duplicateActive = await client.query(
		`SELECT location_id, operational_date, shift_slot, count(*)::int AS active_checks
		   FROM water_temperature_checks
		  WHERE voided_at IS NULL
		  GROUP BY location_id, operational_date, shift_slot
		 HAVING count(*) > 1
		  LIMIT 100`
	);
	findings.push({
		severity: duplicateActive.rowCount ? "block" : "info",
		label: "Duplicate active house/date/slot obligations",
		detail: duplicateActive.rowCount
			? `${duplicateActive.rowCount} identity/identities have more than one non-voided check. The partial unique index is missing or INVALID.`
			: "0 -- the partial unique active identity index is holding.",
		rows: duplicateActive.rows,
	});

	// 5. Index/constraint presence, including CONCURRENTLY-created indexes left
	//    INVALID by a failed build (they do not enforce uniqueness).
	findings.push(await indexHealthFinding(client));

	// 6. Orphan / FK conditions. The FKs are ON DELETE RESTRICT (checks ->
	//    locations, rechecks -> checks) or SET NULL (checks -> shifts), so these
	//    should be structurally impossible; a non-zero count means a constraint
	//    was dropped or data was loaded around it.
	const orphanLocation = await countOrphans(
		client,
		`SELECT count(*)::text AS count
		   FROM water_temperature_checks c
		   LEFT JOIN locations l ON l.id = c.location_id
		  WHERE l.id IS NULL`
	);
	const orphanRecheck = await countOrphans(
		client,
		`SELECT count(*)::text AS count
		   FROM water_temperature_rechecks r
		   LEFT JOIN water_temperature_checks c ON c.id = r.check_id
		  WHERE c.id IS NULL`
	);
	const orphanRevision = await countOrphans(
		client,
		`SELECT count(*)::text AS count
		   FROM water_temperature_check_revisions v
		   LEFT JOIN water_temperature_checks c ON c.id = v.check_id
		  WHERE c.id IS NULL`
	);
	const orphanShift = await countOrphans(
		client,
		`SELECT count(*)::text AS count
		   FROM water_temperature_checks c
		  WHERE c.shift_id IS NOT NULL
		    AND NOT EXISTS (SELECT 1 FROM shifts s WHERE s.id = c.shift_id)`
	);
	const orphanTotal = orphanLocation + orphanRecheck + orphanRevision + orphanShift;
	findings.push({
		severity: orphanTotal > 0 ? "block" : "info",
		label: "Orphan / FK integrity",
		detail: `checks->locations: ${orphanLocation}, rechecks->checks: ${orphanRecheck}, revisions->checks: ${orphanRevision}, checks->shifts (dangling non-null): ${orphanShift}.`,
	});

	// 7. Organization timezone must be present and IANA-resolvable, or clock-in
	//    fails visibly by design (U2) rather than guessing a date.
	findings.push(await timeZoneFinding(client));

	return findings;
}

// ============================================================================
// POST-DEPLOY
// ============================================================================

async function postDeployFindings(client: PoolClient): Promise<Finding[]> {
	const findings: Finding[] = [];

	if (!(await tableExists(client, "water_temperature_checks"))) {
		return [
			{
				severity: "block",
				label: "Schema migration not applied",
				detail: "water_temperature_checks is absent.",
			},
		];
	}

	// 1. Active identity counts by derived state.
	const byState = await client.query(
		`SELECT state, count(*)::int AS active_checks
		   FROM water_temperature_checks
		  WHERE voided_at IS NULL
		  GROUP BY state
		  ORDER BY state`
	);
	findings.push({
		severity: "info",
		label: "Active obligations by derived state",
		detail: byState.rowCount ? "" : "0 active records yet.",
		rows: byState.rows,
	});

	// 2. Header version vs. revision chain. Revisions are append-only and one
	//    per version, so max(revision.version) must equal check.version and the
	//    revision count must equal the version. A mismatch means a header
	//    advanced without its audit row (or vice versa) -- the audit trail is
	//    the canonical record, so any drift is blocking.
	const versionDrift = await client.query(
		`SELECT c.id, c.version AS header_version,
		        count(v.id)::int AS revision_rows,
		        coalesce(max(v.version), 0)::int AS max_revision_version
		   FROM water_temperature_checks c
		   LEFT JOIN water_temperature_check_revisions v ON v.check_id = c.id
		  GROUP BY c.id, c.version
		 HAVING count(v.id) <> c.version OR coalesce(max(v.version), 0) <> c.version
		  LIMIT 100`
	);
	findings.push({
		severity: versionDrift.rowCount ? "block" : "info",
		label: "Header version vs. revision chain",
		detail: versionDrift.rowCount
			? `${versionDrift.rowCount} aggregate(s) whose version does not match a complete 1..n revision chain.`
			: "0 -- every header version has exactly one matching append-only revision per version.",
		rows: versionDrift.rows,
	});

	// 3. Active recheck ordering: per (check, fixture) the non-superseded,
	//    non-voided sequences must be a gapless 1..n run so "latest active
	//    recheck" is unambiguous.
	const orderingDrift = await client.query(
		`SELECT check_id, fixture,
		        count(*)::int AS active_rechecks,
		        max(sequence)::int AS max_sequence
		   FROM water_temperature_rechecks
		  WHERE superseded_at IS NULL AND voided_at IS NULL
		  GROUP BY check_id, fixture
		 HAVING count(*) <> max(sequence)
		  LIMIT 100`
	);
	findings.push({
		severity: orderingDrift.rowCount ? "warn" : "info",
		label: "Active recheck ordering",
		detail: orderingDrift.rowCount
			? `${orderingDrift.rowCount} (check, fixture) pair(s) whose active sequences are not a gapless 1..n run. Expected only where a middle recheck was superseded; verify each against its revision history.`
			: "0 -- every fixture's active recheck chain is a gapless ordered run.",
		rows: orderingDrift.rows,
	});

	// 4. Unresolved above-range obligations -- the operational safety number.
	//    Selected by STATE, not by temperature, so this probe stays correct
	//    across a threshold change (the flagging ceiling is now 121.0F).
	//    Reported as counts and identifiers only; readings stay out of logs.
	const unresolved = await client.query(
		`SELECT c.location_id, c.house_name_snapshot, c.operational_date, c.shift_slot,
		        c.state, c.observed_at
		   FROM water_temperature_checks c
		  WHERE c.voided_at IS NULL
		    AND c.state IN ('action_required', 'recheck_required')
		  ORDER BY c.observed_at
		  LIMIT 200`
	);
	findings.push({
		severity: unresolved.rowCount ? "warn" : "info",
		label: "Unresolved above-range obligations",
		detail: unresolved.rowCount
			? `${unresolved.rowCount} obligation(s) awaiting documented action or a safe recheck. Operational follow-up, not a deploy blocker.`
			: "0 -- no unresolved high-temperature obligations.",
		rows: unresolved.rows,
	});

	// 5. Constraint/index health again, post-deploy.
	findings.push(await indexHealthFinding(client));

	// 6. Post-cutover writes must carry full identity. Any shift created after
	//    enforcement with null identity means enforcement is not actually on.
	const recentUnclassified = await client.query<{ count: string }>(
		`SELECT count(*)::text AS count
		   FROM shifts
		  WHERE location_id IS NULL
		    AND clock_in_time > now() - interval '24 hours'`
	);
	const recentCount = Number(recentUnclassified.rows[0].count);
	findings.push({
		severity: recentCount > 0 ? "block" : "info",
		label: "Post-cutover clock-ins missing identity (last 24h)",
		detail:
			recentCount > 0
				? `${recentCount} shift(s) created in the last 24h have no location_id. New-field enforcement is NOT active on every clock-in path (check both the normal and selfie flows).`
				: "0 -- every clock-in in the last 24h froze a full identity.",
	});

	findings.push(await timeZoneFinding(client));
	return findings;
}

// ============================================================================
// SHARED PROBES
// ============================================================================

async function indexHealthFinding(client: PoolClient): Promise<Finding> {
	const expected = [
		"water_temperature_checks_active_identity_uidx",
		"water_temperature_rechecks_check_fixture_sequence_uidx",
		"water_temperature_check_revisions_check_version_uidx",
	];
	const present = await client.query<{ indexname: string; indisvalid: boolean }>(
		`SELECT i.relname AS indexname, x.indisvalid
		   FROM pg_class i
		   JOIN pg_index x ON x.indexrelid = i.oid
		  WHERE i.relname = ANY($1::text[])`,
		[expected]
	);
	const found = new Map(present.rows.map((r) => [r.indexname, r.indisvalid]));
	const missing = expected.filter((name) => !found.has(name));
	// A CREATE INDEX CONCURRENTLY that fails leaves the index in place but
	// INVALID -- it silently does not enforce uniqueness. Postgres reports no
	// error on subsequent inserts, so this must be checked explicitly.
	const invalid = expected.filter((name) => found.get(name) === false);
	const broken = missing.length + invalid.length;
	return {
		severity: broken > 0 ? "block" : "info",
		label: "Unique index health",
		detail:
			broken > 0
				? `missing: [${missing.join(", ") || "none"}]; INVALID: [${invalid.join(", ") || "none"}]. An INVALID index does not enforce uniqueness -- drop and rebuild it before enabling writes.`
				: `all ${expected.length} unique indexes present and valid.`,
	};
}

async function timeZoneFinding(client: PoolClient): Promise<Finding> {
	if (!(await columnExists(client, "config", "operational_time_zone"))) {
		return {
			severity: "block",
			label: "Organization operational timezone",
			detail: "config.operational_time_zone is absent. Apply drizzle/0011.",
		};
	}
	const rows = await client.query<{ operational_time_zone: string | null }>(
		`SELECT operational_time_zone FROM config`
	);
	if (rows.rowCount === 0) {
		return {
			severity: "warn",
			label: "Organization operational timezone",
			detail: "No config row exists yet; the first write will take the America/Chicago column default.",
		};
	}
	const bad = rows.rows.filter((r) => !isValidIanaTimeZone(r.operational_time_zone));
	return {
		severity: bad.length > 0 ? "block" : "info",
		label: "Organization operational timezone",
		detail:
			bad.length > 0
				? `${bad.length} config row(s) hold a missing or non-IANA timezone. Clock-in fails visibly by design rather than guessing a date -- fix before cutover.`
				: `valid: ${rows.rows.map((r) => r.operational_time_zone).join(", ")}`,
	};
}

function isValidIanaTimeZone(value: string | null): boolean {
	if (!value || !value.trim()) return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

async function tableExists(client: PoolClient, table: string): Promise<boolean> {
	const result = await client.query(`SELECT to_regclass($1) AS reg`, [table]);
	return result.rows[0].reg !== null;
}

async function columnExists(
	client: PoolClient,
	table: string,
	column: string
): Promise<boolean> {
	const result = await client.query(
		`SELECT 1 FROM information_schema.columns
		  WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
		[table, column]
	);
	return (result.rowCount ?? 0) > 0;
}

async function countOrphans(client: PoolClient, sql: string): Promise<number> {
	const result = await client.query<{ count: string }>(sql);
	return Number(result.rows[0].count);
}

// ============================================================================
// REPORTING
// ============================================================================

function report(mode: Mode, findings: ReadonlyArray<Finding>): number {
	const title =
		mode === "pre-cutover"
			? "WATER-TEMPERATURE PRE-CUTOVER REPORT"
			: "WATER-TEMPERATURE POST-DEPLOY CONSISTENCY CHECK";
	console.log(`\n${title}`);
	console.log(`${"=".repeat(title.length)}`);
	console.log(`generated: ${new Date().toISOString()}\n`);

	for (const finding of findings) {
		const marker =
			finding.severity === "block" ? "[BLOCK]" : finding.severity === "warn" ? "[WARN ]" : "[ ok  ]";
		console.log(`${marker} ${finding.label}`);
		if (finding.detail) console.log(`        ${finding.detail}`);
		if (finding.rows?.length) {
			for (const row of finding.rows.slice(0, 20)) {
				console.log(`        - ${JSON.stringify(row)}`);
			}
			if (finding.rows.length > 20) {
				console.log(`        ... ${finding.rows.length - 20} more row(s) not shown`);
			}
		}
		console.log("");
	}

	const blocking = findings.filter((f) => f.severity === "block");
	if (blocking.length > 0) {
		console.log(
			`RESULT: BLOCKED -- ${blocking.length} blocking finding(s): ${blocking
				.map((f) => f.label)
				.join("; ")}`
		);
		return 1;
	}
	const warnings = findings.filter((f) => f.severity === "warn");
	console.log(
		warnings.length > 0
			? `RESULT: CLEAR with ${warnings.length} warning(s) requiring operational follow-up.`
			: "RESULT: CLEAR."
	);
	return 0;
}

main()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((error: unknown) => {
		// Identifier/status only: never echo row values into operational output.
		console.error(
			"water-temperature rollout check failed:",
			error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error"
		);
		process.exitCode = 2;
	});
