// src/components/care/IncidentReportsList.tsx

'use client';

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useUser} from '@clerk/nextjs';
import {toast} from 'sonner';
import SharedIncidentsAccordion from './SharedIncidentsAccordion';
import IncidentReportForm from './IncidentReportForm';
import {usePaginatedSearch} from './usePaginatedSearch';
import {canEditIncidentReport} from '@/lib/incident-edit-policy';

interface IncidentReport {
	id: string;
	incidentDate: Date | string;
	incidentType: string;
	severity: string;
	description: string;
	location?: string;
	reportedBy: string;
	reportedByName?: string | null;
	resident?: {name: string};
	actionTaken?: string;
	witnessNames?: string;
	followUpRequired: boolean;
	followUpNotes?: string;
	attachments?: string[];
	createdAt: Date | string;
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
	const {user} = useUser();
	const [editingReport, setEditingReport] = useState<IncidentReport | null>(null);

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

	// Mirrors the server-side gate in updateIncidentReport; the server still
	// re-checks on PATCH, this only decides whether the button is worth showing.
	const canEdit = useCallback(
		(report: {reportedBy?: string; createdAt?: Date | string | null}) =>
			Boolean(user?.id && report.reportedBy) &&
			canEditIncidentReport(
				{reportedBy: report.reportedBy!, createdAt: report.createdAt},
				user!.id
			),
		[user]
	);

	if (editingReport) {
		return (
			<IncidentReportForm
				residentId={residentId}
				residentName={editingReport.resident?.name ?? 'Resident'}
				location={editingReport.location ?? ''}
				existingReport={editingReport}
				onSuccess={() => {
					setEditingReport(null);
					reload();
				}}
				onCancel={() => setEditingReport(null)}
			/>
		);
	}

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
					<SharedIncidentsAccordion
						incidents={reports}
						canEdit={canEdit}
						onEdit={(report) => setEditingReport(report as IncidentReport)}
					/>
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
