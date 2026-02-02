/* eslint-disable react-hooks/exhaustive-deps */
// src/components/care/IncidentReportsList.tsx

'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';
import SharedIncidentsAccordion from './SharedIncidentsAccordion';

interface IncidentReport {
	id: string;
	incidentDate: Date;
	incidentType: string;
	severity: string;
	description: string;
	reportedByName: string;
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
	const [reports, setReports] = useState<IncidentReport[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetchReports();
	}, [residentId, refreshTrigger]);

	async function fetchReports() {
		try {
			const res = await fetch(`/api/care/incidents?residentId=${residentId}`);
			if (!res.ok) throw new Error('Failed to fetch');

			const data = await res.json();
			setReports(data);
		} catch (error) {
			console.error('Error fetching incident reports:', error);
			toast.error('Failed to load incident reports');
		} finally {
			setLoading(false);
		}
	}



	return (
		<div className="space-y-4">
            <SharedIncidentsAccordion incidents={reports} />
		</div>
	);
}
