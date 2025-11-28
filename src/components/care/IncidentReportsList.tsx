/* eslint-disable react-hooks/exhaustive-deps */
// src/components/care/IncidentReportsList.tsx

'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

interface IncidentReport {
	id: string;
	incidentDate: Date;
	incidentType: string;
	severity: string;
	description: string;
	reportedByName: string;
	actionTaken?: string;
	witnessNames?: string; // Added
	followUpRequired: boolean;
	followUpNotes?: string; // Added
	attachments?: string[]; // Added
	createdAt: Date;
}

interface IncidentReportsListProps {
	residentId: string;
	refreshTrigger?: number;
}

const SEVERITY_COLORS: Record<string, string> = {
	low: 'bg-green-100 text-green-800',
	medium: 'bg-yellow-100 text-yellow-800',
	high: 'bg-orange-100 text-orange-800',
	critical: 'bg-red-100 text-red-800',
};

export default function IncidentReportsList({
	residentId,
	refreshTrigger,
}: IncidentReportsListProps) {
	const [reports, setReports] = useState<IncidentReport[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedReport, setSelectedReport] = useState<IncidentReport | null>(
		null
	);

	useEffect(() => {
		fetchReports();
	}, [residentId, refreshTrigger]);

	async function fetchReports() {
		try {
			const res = await fetch(`/api/care/incidents?residentId=${residentId}`); // Updated endpoint
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

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
		);
	}

	if (selectedReport) {
		return (
			<div className="bg-white rounded-lg border p-6">
				<button
					onClick={() => setSelectedReport(null)}
					className="text-blue-600 hover:underline mb-4">
					← Back to list
				</button>

				<div className="space-y-4">
					<div className="flex justify-between items-start">
						<div>
							<h3 className="text-xl font-bold">
								{selectedReport.incidentType} Incident
							</h3>
							<p className="text-gray-600 text-sm">
								{new Date(selectedReport.incidentDate).toLocaleString()}
							</p>
						</div>
						<span
							className={`px-3 py-1 rounded-full text-sm font-medium ${
								SEVERITY_COLORS[selectedReport.severity]
							}`}>
							{selectedReport.severity.toUpperCase()}
						</span>
					</div>

					<div>
						<h4 className="font-semibold mb-1">Reported By</h4>
						<p className="text-gray-700">{selectedReport.reportedByName}</p>
					</div>

					<div>
						<h4 className="font-semibold mb-1">Description</h4>
						<p className="text-gray-700 whitespace-pre-wrap">
							{selectedReport.description}
						</p>
					</div>

					{selectedReport.actionTaken && (
						<div>
							<h4 className="font-semibold mb-1">Action Taken</h4>
							<p className="text-gray-700 whitespace-pre-wrap">
								{selectedReport.actionTaken}
							</p>
						</div>
					)}

					{selectedReport.followUpRequired && (
						<div className="bg-yellow-50 border border-yellow-200 rounded p-4">
							<p className="text-yellow-800 font-medium">
								⚠️ Follow-up Required
							</p>
						</div>
					)}

					{selectedReport.followUpNotes && (
						<div>
							<h4 className="font-semibold mb-1">Follow-up Notes</h4>
							<p className="text-gray-700 whitespace-pre-wrap">
								{selectedReport.followUpNotes}
							</p>
						</div>
					)}

					{selectedReport.witnessNames && (
						<div>
							<h4 className="font-semibold mb-1">Witnesses</h4>
							<p className="text-gray-700 whitespace-pre-wrap">
								{selectedReport.witnessNames}
							</p>
						</div>
					)}

					{selectedReport.attachments &&
						selectedReport.attachments.length > 0 && (
							<div>
								<h4 className="font-semibold mb-1">Attachments</h4>
								<ul className="list-disc ml-5 text-gray-700">
									{selectedReport.attachments.map((fileId, index) => (
										<li key={index}>
											{/* In a real app, you'd fetch file details or generate a download link */}
											<a
												href={`/api/files/download/${fileId}`}
												target="_blank"
												rel="noopener noreferrer"
												className="text-blue-600 hover:underline">
												{fileId} (Download)
											</a>
										</li>
									))}
								</ul>
							</div>
						)}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{reports.length === 0 ? (
				<div className="text-center py-12 text-gray-500">
					<p className="text-lg mb-2">No incident reports</p>
					<p className="text-sm">
						Click &quot;Report New Incident&quot; to create one
					</p>
				</div>
			) : (
				reports.map((report) => (
					<div
						key={report.id}
						onClick={() => setSelectedReport(report)}
						className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
						<div className="flex justify-between items-start mb-2">
							<div>
								<h4 className="font-semibold text-lg">{report.incidentType}</h4>
								<p className="text-gray-600 text-sm">
									{new Date(report.incidentDate).toLocaleString()}
								</p>
							</div>
							<span
								className={`px-3 py-1 rounded-full text-xs font-medium ${
									SEVERITY_COLORS[report.severity]
								}`}>
								{report.severity.toUpperCase()}
							</span>
						</div>

						<p className="text-gray-700 text-sm line-clamp-2 mb-2">
							{report.description}
						</p>

						<div className="flex justify-between items-center text-xs text-gray-500">
							<span>Reported by: {report.reportedByName}</span>
							{report.followUpRequired && (
								<span className="text-yellow-600 font-medium">
									Follow-up required
								</span>
							)}
						</div>
					</div>
				))
			)}
		</div>
	);
}
