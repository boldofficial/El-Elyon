import {drizzle} from 'drizzle-orm/neon-http';
import {neon} from '@neondatabase/serverless';
import * as schema from './schema';

// This can be used in both API routes and (carefully) in frontend
const connectionString =
	process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error('Missing DATABASE_URL environment variable');
}

const sql = neon(connectionString);
export const db = drizzle(sql, {schema});
