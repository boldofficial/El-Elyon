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
 * Executes a database transaction
 * Rolls back automatically if an error occurs
 * 
 * @example
 * const result = await withTransaction(async (tx) => {
 *   const user = await tx.insert(users).values({...}).returning();
 *   const role = await tx.insert(roles).values({...}).returning();
 *   return { user, role };
 * });
 */
export async function withTransaction<T>(
	callback: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> {
	return db.transaction(async (tx) => {
		return callback(tx);
	});
}
