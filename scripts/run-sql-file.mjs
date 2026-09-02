#!/usr/bin/env node
/**
 * Applies a .sql file to the database over the PostgreSQL wire protocol.
 *
 * Why this exists: the app's runtime client is `drizzle-orm/neon-http`, which
 * talks to Neon's HTTP SQL endpoint and cannot run multi-statement scripts or
 * transactions -- so it cannot apply migrations. `psql` is not installed on
 * every dev machine either. Browser SQL editors pre-parse input and have been
 * observed truncating statements mid-file (0010's `jsonb_path_exists` line,
 * which contains `?` and quotes nested inside a single-quoted jsonpath).
 *
 * This runner uses `pg` (already a dependency), which sends the file to the
 * server exactly as written, and wraps it in a transaction so a failure rolls
 * back cleanly instead of leaving a half-applied migration.
 *
 * Usage:
 *   node scripts/run-sql-file.mjs drizzle/0010_add_life_safety_reporting_v2.sql
 *   node scripts/run-sql-file.mjs <file> --url "postgresql://..."
 *   node scripts/run-sql-file.mjs <file> --dry-run
 *
 * Connection resolution, in order:
 *   1. --url <connection-string>
 *   2. process.env.MIGRATION_DATABASE_URL
 *   3. process.env.DATABASE_URL (loaded from .env.local, like drizzle.config.ts)
 */

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({path: '.env.local'});

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith('--'));
const urlIdx = args.indexOf('--url');
const explicitUrl = urlIdx === -1 ? null : args[urlIdx + 1];
const dryRun = args.includes('--dry-run');

if (!filePath) {
	console.error('Usage: node scripts/run-sql-file.mjs <file.sql> [--url <conn>] [--dry-run]');
	process.exit(1);
}

const resolved = path.resolve(filePath);
if (!fs.existsSync(resolved)) {
	console.error(`No such file: ${resolved}`);
	process.exit(1);
}

const connectionString =
	explicitUrl || process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
	console.error(
		'No connection string. Pass --url, or set MIGRATION_DATABASE_URL or DATABASE_URL in .env.local.'
	);
	process.exit(1);
}

const sql = fs.readFileSync(resolved, 'utf8');

// Don't double-wrap a file that already manages its own transaction.
const alreadyTransactional = /^\s*BEGIN\s*;/im.test(sql);
// CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
const hasConcurrently = /CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(sql);
const wrap = !alreadyTransactional && !hasConcurrently;

// Never print the password. Show only where we are pointed.
let target = '(unparseable connection string)';
try {
	const u = new URL(connectionString);
	target = `${u.hostname}${u.pathname}`;
} catch {
	/* keep placeholder */
}

console.log(`File:    ${path.relative(process.cwd(), resolved)} (${sql.length} bytes)`);
console.log(`Target:  ${target}`);
console.log(
	`Wrapper: ${
		wrap
			? 'BEGIN/COMMIT added by this runner'
			: alreadyTransactional
				? 'file manages its own transaction'
				: 'none (file uses CREATE INDEX CONCURRENTLY)'
	}`
);

if (dryRun) {
	console.log('\n--dry-run: nothing was sent.');
	process.exit(0);
}

const client = new pg.Client({
	connectionString,
	ssl: {rejectUnauthorized: false},
	// A big migration can take a while; don't cut it off mid-way.
	statement_timeout: 0,
});

try {
	await client.connect();

	const who = await client.query(
		'select current_database() as db, current_user as usr, version() as v'
	);
	console.log(`Connected: ${who.rows[0].db} as ${who.rows[0].usr}`);
	console.log('');

	if (wrap) await client.query('BEGIN');
	try {
		await client.query(sql);
		if (wrap) await client.query('COMMIT');
		console.log('✅ Applied successfully.');
	} catch (error) {
		if (wrap) {
			await client.query('ROLLBACK').catch(() => undefined);
			console.error('↩️  Rolled back -- no partial changes were left behind.');
		}
		throw error;
	}
} catch (error) {
	console.error('');
	console.error('❌ Failed.');
	// pg surfaces the useful bits separately; print them all.
	for (const key of ['message', 'detail', 'hint', 'where', 'position', 'code']) {
		if (error?.[key]) console.error(`   ${key}: ${error[key]}`);
	}
	process.exitCode = 1;
} finally {
	await client.end().catch(() => undefined);
}
