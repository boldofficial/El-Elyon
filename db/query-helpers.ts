// db/query-helpers.ts

import {ilike, or, SQL} from 'drizzle-orm';

type SearchableColumn = Parameters<typeof ilike>[0];

/**
 * Builds an OR'd ILIKE condition across multiple columns for free-text search.
 * Returns undefined when there is no term to search, so callers can push the
 * result straight into a conditions array without a separate `if` guard or an
 * `as SQL` cast.
 */
export function searchCondition(
	term: string | undefined | null,
	columns: SearchableColumn[]
): SQL | undefined {
	if (!term || columns.length === 0) return undefined;
	return or(...columns.map((column) => ilike(column, `%${term}%`)));
}

/**
 * For routes that fetch `limit + 1` rows to detect a next page without a
 * separate COUNT query (resident-logs, incidents): the extra row, if
 * present, signals `hasMore` and gets sliced off before the rows reach the
 * caller.
 */
export function paginatePage<T>(rows: T[], limit: number): {items: T[]; hasMore: boolean} {
	const hasMore = rows.length > limit;
	return {items: hasMore ? rows.slice(0, limit) : rows, hasMore};
}

/**
 * For a fully-fetched array paginated in memory by offset/limit
 * (resident-documents' merged union of three tables, where the "extra row"
 * trick above doesn't apply because nothing is over-fetched from SQL).
 */
export function offsetSlice<T>(
	rows: T[],
	offset: number,
	limit: number
): {items: T[]; hasMore: boolean} {
	return {
		items: rows.slice(offset, offset + limit),
		hasMore: rows.length > offset + limit,
	};
}
