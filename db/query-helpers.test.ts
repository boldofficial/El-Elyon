import assert from 'node:assert/strict';
import test from 'node:test';
import {residentLogs} from './schema';
import {offsetSlice, paginatePage, searchCondition} from './query-helpers';

// ============================================================================
// searchCondition -- no DB required, drizzle builds the SQL AST in memory
// ============================================================================

test('searchCondition returns undefined for an empty, null, or undefined term', () => {
	assert.equal(searchCondition('', [residentLogs.content]), undefined);
	assert.equal(searchCondition(null, [residentLogs.content]), undefined);
	assert.equal(searchCondition(undefined, [residentLogs.content]), undefined);
	assert.equal(searchCondition('   '.trim(), [residentLogs.content]), undefined);
});

test('searchCondition returns undefined when no columns are given', () => {
	assert.equal(searchCondition('term', []), undefined);
});

test('searchCondition returns a condition when a term and columns are given', () => {
	const condition = searchCondition('term', [residentLogs.content, residentLogs.authorName]);
	assert.notEqual(condition, undefined);
});

// ============================================================================
// paginatePage -- the limit+1-fetch-then-slice pattern (resident-logs, incidents)
// ============================================================================

test('paginatePage reports no more pages when fewer rows than the limit come back', () => {
	const {items, hasMore} = paginatePage([1, 2, 3], 5);
	assert.deepEqual(items, [1, 2, 3]);
	assert.equal(hasMore, false);
});

test('paginatePage reports no more pages at the exact limit boundary', () => {
	const {items, hasMore} = paginatePage([1, 2, 3, 4, 5], 5);
	assert.deepEqual(items, [1, 2, 3, 4, 5]);
	assert.equal(hasMore, false);
});

test('paginatePage slices off the extra row and reports hasMore at limit+1', () => {
	const {items, hasMore} = paginatePage([1, 2, 3, 4, 5, 6], 5);
	assert.deepEqual(items, [1, 2, 3, 4, 5]);
	assert.equal(hasMore, true);
});

test('paginatePage handles an empty result set', () => {
	const {items, hasMore} = paginatePage([], 5);
	assert.deepEqual(items, []);
	assert.equal(hasMore, false);
});

// ============================================================================
// offsetSlice -- the in-memory offset/limit pattern (resident-documents' merged union)
// ============================================================================

test('offsetSlice returns the requested window and hasMore when more rows follow', () => {
	const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
	const {items, hasMore} = offsetSlice(rows, 0, 5);
	assert.deepEqual(items, [1, 2, 3, 4, 5]);
	assert.equal(hasMore, true);
});

test('offsetSlice reports no more pages on the exact last page', () => {
	const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
	const {items, hasMore} = offsetSlice(rows, 5, 5);
	assert.deepEqual(items, [6, 7, 8, 9, 10]);
	assert.equal(hasMore, false);
});

test('offsetSlice reports no more pages when the total is an exact multiple of the page size', () => {
	const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
	const {items, hasMore} = offsetSlice(rows, 10, 5);
	assert.deepEqual(items, []);
	assert.equal(hasMore, false);
});

test('offsetSlice handles an offset past the end of the array', () => {
	const rows = [1, 2, 3];
	const {items, hasMore} = offsetSlice(rows, 10, 5);
	assert.deepEqual(items, []);
	assert.equal(hasMore, false);
});
