// lib/resident-status-sql.ts
//
// The database-side twin of isActiveResident() in lib/resident-status.ts. Kept
// apart so the client components that import resident-status for its badge
// wording do not drag the Drizzle schema into the browser bundle.

import {eq} from 'drizzle-orm';
import {residents} from '@/db/schema';
import {RESIDENT_ACTIVE} from '@/lib/resident-status';

/**
 * Drizzle predicate for `residents.status = 'active'`, to drop into an
 * `and(...)` alongside the usual location conditions.
 *
 * Unlike `isActiveResident` this cannot see a NULL status as active, but it
 * does not need to: the column is NOT NULL with a default.
 */
export function activeResidentsOnly() {
	return eq(residents.status, RESIDENT_ACTIVE);
}
