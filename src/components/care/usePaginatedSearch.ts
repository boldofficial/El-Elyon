'use client';

import {useCallback, useEffect, useRef, useState} from 'react';

interface UsePaginatedSearchOptions<T> {
	/** API route to fetch from, e.g. '/api/care/resident-logs'. */
	endpoint: string;
	pageSize?: number;
	/** Extra query params to send on every fetch (e.g. residentId, source). Undefined values are omitted. */
	extraParams?: Record<string, string | undefined>;
	/** Applied to each fetched page's raw JSON array before it lands in state (e.g. activity hydration). */
	transform?: (raw: any[]) => Promise<T[]> | T[];
	/** Called with the error message whenever a fetch fails, in addition to the returned `error` state. */
	onError?: (message: string) => void;
}

/**
 * Shared search + offset pagination for the resident-detail list views (Log
 * History, Incident Reports, Documents/ISP/Fire Evac). Every fetch is tagged
 * with a generation id so a slow, superseded response (a "View More" append
 * racing a newer debounced search, or a fetch for a resident the caller has
 * since navigated away from) is dropped instead of silently overwriting
 * state -- multiple reviewers found the same race independently:
 * stale/out-of-order responses can leak one resident's records onto another
 * resident's screen on a shared kiosk, or interleave stale search results.
 * A ref-based in-flight lock also blocks a rapid double-click on "View More"
 * from firing two requests for the same page.
 */
export function usePaginatedSearch<T = any>({
	endpoint,
	pageSize = 20,
	extraParams,
	transform,
	onError,
}: UsePaginatedSearchOptions<T>) {
	const [items, setItems] = useState<T[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [search, setSearch] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [hasMore, setHasMore] = useState(false);

	const requestIdRef = useRef(0);
	const inFlightRef = useRef(false);

	// Debounce search input so we don't hit the API on every keystroke.
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
		return () => clearTimeout(timer);
	}, [search]);

	const extraParamsKey = JSON.stringify(extraParams || {});

	const fetchPage = useCallback(
		async (offset: number, append: boolean) => {
			if (append && inFlightRef.current) return;

			const requestId = ++requestIdRef.current;
			inFlightRef.current = true;
			if (append) setLoadingMore(true);
			else setLoading(true);
			setError(null);

			try {
				const params = new URLSearchParams({
					limit: String(pageSize),
					offset: String(offset),
				});
				if (debouncedSearch) params.set('search', debouncedSearch);
				Object.entries(extraParams || {}).forEach(([key, value]) => {
					if (value !== undefined) params.set(key, value);
				});

				const res = await fetch(`${endpoint}?${params.toString()}`);
				if (!res.ok) throw new Error('Failed to fetch');
				const raw = await res.json();
				const data = transform ? await transform(raw) : (raw as T[]);

				// A newer request has since superseded this one -- drop the stale result.
				if (requestId !== requestIdRef.current) return;

				setHasMore(res.headers.get('X-Has-More') === 'true');
				setItems((prev) => (append ? [...prev, ...data] : data));
			} catch (err: any) {
				if (requestId !== requestIdRef.current) return;
				console.error(`Error fetching ${endpoint}:`, err);
				const message = err.message || 'Failed to load';
				setError(message);
				onError?.(message);
			} finally {
				if (requestId === requestIdRef.current) {
					setLoading(false);
					setLoadingMore(false);
				}
				inFlightRef.current = false;
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[endpoint, pageSize, debouncedSearch, extraParamsKey, transform, onError]
	);

	useEffect(() => {
		fetchPage(0, false);
	}, [fetchPage]);

	const loadMore = useCallback(() => fetchPage(items.length, true), [fetchPage, items.length]);
	const reload = useCallback(() => fetchPage(0, false), [fetchPage]);

	return {
		items,
		loading,
		loadingMore,
		error,
		hasMore,
		search,
		setSearch,
		debouncedSearch,
		loadMore,
		reload,
	};
}
