#!/usr/bin/env node
/**
 * Emits the SQL that tells `drizzle-kit migrate` which migrations a database
 * ALREADY has, so it skips them instead of re-running them.
 *
 * Why this is needed: this repo's migrations were applied by hand for a long
 * time, with no `drizzle/meta/_journal.json` and no `drizzle.__drizzle_migrations`
 * bookkeeping table. A database in that state looks completely un-migrated to
 * drizzle. Running `drizzle-kit migrate` against it without baselining first
 * would attempt `0000_initial_database_schema.sql` -- a full `CREATE TABLE`
 * script -- against a populated database.
 *
 * How drizzle decides what to run (drizzle-orm 0.44.x, see
 * node_modules/drizzle-orm/neon-http/migrator.js): it reads the single most
 * recent row from `drizzle.__drizzle_migrations` ordered by `created_at desc`,
 * then applies every journal entry whose `when` is GREATER than that value.
 * The `hash` column is recorded but never compared, so it is informational
 * only -- which also means a CRLF/LF checkout difference cannot cause a
 * spurious re-run.
 *
 * Usage:
 *   node scripts/drizzle-baseline.mjs --through 0010_add_life_safety_reporting_v2
 *   node scripts/drizzle-baseline.mjs --list
 *
 * Pick `--through` by inspecting the target database, NOT by assuming. See
 * docs/deployment/2026-09-01-water-temperature-rollout.md for the probe query.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'drizzle');
const journalPath = path.join(migrationsDir, 'meta', '_journal.json');

if (!fs.existsSync(journalPath)) {
	console.error(`No journal at ${journalPath}`);
	process.exit(1);
}

const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
const entries = journal.entries ?? [];

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const throughIdx = args.indexOf('--through');
const through = throughIdx === -1 ? null : args[throughIdx + 1];

if (listOnly || !through) {
	console.error('Migrations in journal order:\n');
	for (const entry of entries) {
		console.error(`  ${String(entry.idx).padStart(2)}  ${entry.tag}`);
	}
	console.error(
		'\nRe-run with --through <tag> naming the LAST migration the target ' +
			'database already has.\nEverything up to and including it is marked applied; ' +
			'everything after it will be run by `drizzle-kit migrate`.'
	);
	process.exit(listOnly ? 0 : 1);
}

const cutoff = entries.findIndex((entry) => entry.tag === through);
if (cutoff === -1) {
	console.error(`Unknown migration tag: ${through}\nRun with --list to see valid tags.`);
	process.exit(1);
}

const applied = entries.slice(0, cutoff + 1);
const pending = entries.slice(cutoff + 1);

const rows = applied.map((entry) => {
	const sqlPath = path.join(migrationsDir, `${entry.tag}.sql`);
	const hash = crypto.createHash('sha256').update(fs.readFileSync(sqlPath).toString()).digest('hex');
	return `\t('${hash}', ${entry.when})`;
});

const lines = [
	'-- Baseline drizzle migration bookkeeping for a database that was migrated by hand.',
	`-- Marks ${applied.length} migration(s) as already applied, through: ${through}`,
	'--',
	pending.length
		? `-- \`drizzle-kit migrate\` will then apply ${pending.length} pending migration(s):\n` +
			pending.map((entry) => `--   ${entry.tag}`).join('\n')
		: '-- No migrations remain pending after this baseline.',
	'--',
	'-- Verify the target database FIRST -- baselining a migration that was never',
	'-- actually applied will cause drizzle to skip it permanently.',
	'',
	'BEGIN;',
	'',
	'CREATE SCHEMA IF NOT EXISTS "drizzle";',
	'',
	'CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (',
	'\tid SERIAL PRIMARY KEY,',
	'\thash text NOT NULL,',
	'\tcreated_at bigint',
	');',
	'',
	'-- Refuse to double-baseline: this is a no-op if any row already exists.',
	'INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")',
	'SELECT * FROM (VALUES',
	rows.join(',\n'),
	') AS v(hash, created_at)',
	'WHERE NOT EXISTS (SELECT 1 FROM "drizzle"."__drizzle_migrations");',
	'',
	'COMMIT;',
	'',
	'-- Confirm:',
	'--   SELECT count(*), max(created_at) FROM "drizzle"."__drizzle_migrations";',
	`--   expected count = ${applied.length}, max(created_at) = ${applied[applied.length - 1].when}`,
	''
];

console.log(lines.join('\n'));
