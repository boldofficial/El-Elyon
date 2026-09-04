'use client';

import React, {useCallback} from 'react';
import SharedLogsTable from './SharedLogsTable';
import {usePaginatedSearch} from './usePaginatedSearch';

interface Activity {
	id: string;
	activityType: string;
	completed: boolean;
	notes: string | null;
}

interface Log {
	id: string;
	residentId: string;
	content: string;
    template?: string;
	createdAt: string;
	authorName?: string;
	activities: Activity[];
}

interface Props {
	residentId: string;
}

async function hydrateActivities(rawLogs: any[]) {
	return Promise.all(
		rawLogs.map(async (log) => {
			if (log.activities && log.activities.length > 0) return log;
			try {
				const actRes = await fetch(`/api/care/resident-logs/${log.id}/activities`);
				if (!actRes.ok) return log;
				const activities = await actRes.json();
				return {...log, activities};
			} catch (_err) {
				return log;
			}
		})
	);
}

export default function ResidentActivityHistory({residentId}: Props) {
	const extraParams = React.useMemo(() => ({residentId}), [residentId]);
	const transform = useCallback((raw: any[]) => hydrateActivities(raw), []);

	const {items: logs, loading, error, hasMore, loadingMore, search, setSearch, debouncedSearch, loadMore} =
		usePaginatedSearch<Log>({
			endpoint: '/api/care/resident-logs',
			extraParams,
			transform,
		});

	return (
		<div className="space-y-4">
			<input
				type="text"
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder="Search log entries or staff name..."
				className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
			/>

			{loading ? (
				<div className="flex justify-center py-8">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
				</div>
			) : error ? (
				<div className="text-red-500 text-center py-8">{error}</div>
			) : logs.length === 0 ? (
				<div className="text-center py-12 text-gray-500">
					<p>{debouncedSearch ? 'No log entries match your search.' : 'No activity history found.'}</p>
				</div>
			) : (
				<div className="space-y-6">
					<SharedLogsTable logs={logs} />
					{hasMore && (
						<div className="flex justify-center pt-2">
							<button
								onClick={loadMore}
								disabled={loadingMore}
								className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
							>
								{loadingMore ? 'Loading...' : 'View More'}
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
