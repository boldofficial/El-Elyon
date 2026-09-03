import {drizzle} from 'drizzle-orm/neon-http';
import {neon} from '@neondatabase/serverless';
import * as schema from './schema';
import {validateEnvironment} from '../lib/env-validation';

// Validate environment on startup
validateEnvironment();

// This can be used in both API routes and (carefully) in frontend
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error('Missing DATABASE_URL environment variable');
}

const sql = neon(connectionString);
export const db = drizzle(sql, {schema});

/**
 * IMPORTANT: `db.transaction()` does not work with this driver.
 *
 * We connect over `drizzle-orm/neon-http`, which sends each query as an
 * independent HTTP request to Neon's SQL-over-HTTP endpoint. Interactive
 * transactions need a pinned session (BEGIN ... COMMIT on one connection),
 * which HTTP request/response cannot provide. The driver therefore throws
 * "No transactions support in neon-http driver" unconditionally — see
 * node_modules/drizzle-orm/neon-http/session.js.
 *
 * Use `db.batch([...])` instead. It sends every statement in ONE request and
 * Neon runs them as a single atomic transaction, so they all commit or all
 * roll back:
 *
 *   const [alerts, guardiansUpdated, [deleted]] = await db.batch([
 *     db.delete(complianceAlerts).where(...),
 *     db.update(guardians).set({...}).where(...),
 *     db.delete(residents).where(eq(residents.id, id)).returning(),
 *   ]);
 *
 * The one thing batch cannot do is branch mid-transaction on a value it just
 * read. Express that in SQL instead — a subquery, a `RETURNING` clause you
 * inspect afterwards, or an atomic expression like `jsonb_col - $1` rather
 * than read-modify-write in TypeScript.
 *
 * A `withTransaction()` helper used to live here. It was removed because it
 * could only ever throw at runtime.
 */
