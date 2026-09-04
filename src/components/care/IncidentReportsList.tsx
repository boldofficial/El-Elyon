// src/components/care/IncidentReportsList.tsx

'use client';

import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {toast} from 'sonner';
import SharedIncidentsAccordion from './SharedIncidentsAccordion';
import {usePaginatedSearch} from './usePaginatedSearch';

interface IncidentReport {
	id: string;
	incidentDate: Date;
	incidentType: string;
	severity: string;
	description: string;
	reportedByName?: string | null;
	actionTaken?: string;
	witnessNames?: string;
	followUpRequired: boolean;
	followUpNotes?: string;
	attachments?: string[];
	createdAt: Date;
}

interface IncidentReportsListProps {
	residentId: string;
	refreshTrigger?: number;
}

export default function IncidentReportsList({
	residentId,
	refreshTrigger,
}: IncidentReportsListProps) {
	const extraParams = useMemo(() => ({residentId}), [residentId]);
	const onError = useCallback(() => toast.error('Failed to load incident reports'), []);

	const {
		items: reports,
		loading,
		loadingMore,
		hasMore,
		search,
		setSearch,
		debouncedSearch,
		loadMore,
		reload,
	} = usePaginatedSearch<IncidentReport>({
		endpoint: '/api/care/incidents',
		extraParams,
		onError,
	});

	const isFirstRun = useRef(true);
	useEffect(() => {
		if (isFirstRun.current) {
			isFirstRun.current = false;
			return;
		}
		reload();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [refreshTrigger]);

	return (
		<div className="space-y-4">
			<input
				type="text"
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder="Search incidents by type, description, or reporter..."
				className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
			/>

			{loading ? (
				<div className="flex justify-center py-8">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
				</div>
			) : reports.length === 0 ? (
				<div className="text-center py-12 text-gray-500">
					<p>{debouncedSearch ? 'No incidents match your search.' : 'No incident reports found.'}</p>
				</div>
			) : (
				<>
					<SharedIncidentsAccordion incidents={reports} />
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
				</>
			)}
		</div>
	);
}
