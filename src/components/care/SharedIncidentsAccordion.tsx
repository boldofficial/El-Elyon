'use client';

import React, { useState } from 'react';

const SEVERITY_COLORS: Record<string, string> = {
	low: 'bg-green-100 text-green-800',
	medium: 'bg-yellow-100 text-yellow-800',
	high: 'bg-orange-100 text-orange-800',
	critical: 'bg-red-100 text-red-800',
};

interface IncidentReport {
	id: string;
	incidentDate: Date | string;
	incidentType: string;
	severity: string;
	description: string;
	reportedByName?: string | null;
	resident?: { name: string }; // Optional resident object if available
	location?: string;
	actionTaken?: string;
	witnessNames?: string;
	followUpRequired: boolean;
	followUpNotes?: string;
	attachments?: string[];
}

interface SharedIncidentsAccordionProps {
	incidents: IncidentReport[];
}

export default function SharedIncidentsAccordion({ incidents }: SharedIncidentsAccordionProps) {
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

	const toggleExpand = (id: string) => {
		const newExpanded = new Set(expandedIds);
		if (newExpanded.has(id)) {
			newExpanded.delete(id);
		} else {
			newExpanded.add(id);
		}
		setExpandedIds(newExpanded);
	};

	// Helper to handle download attachment
	const handleDownloadAttachment = (fileKey: string, e: React.MouseEvent) => {
		e.stopPropagation(); // Prevent toggling accordion
		window.open(`/api/uploads?fileId=${fileKey}`, '_blank');
	};

	return (
		<div className="space-y-3">
			{incidents.length === 0 ? (
				<div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
					<div className="text-4xl mb-3">⚠️</div>
					<p>No incident reports found</p>
				</div>
			) : (
				incidents.map((report) => {
					const isExpanded = expandedIds.has(report.id);
					const residentName = report.resident?.name || 'Unknown Resident'; // Handle both nested and direct props if needed, mostly nested from API

					return (
						<div
							key={report.id}
							className={`bg-white rounded-lg shadow-sm border transition-all duration-200 ${
								isExpanded
									? 'ring-1 ring-red-500 border-red-500'
									: 'hover:border-gray-300'
							}`}>
							<button
								onClick={() => toggleExpand(report.id)}
								className="w-full text-left px-4 py-3 sm:px-6 flex items-center justify-between gap-4 focus:outline-none">
								<div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
									{/* Date */}
									<div className="md:col-span-3 text-sm text-gray-500">
										{new Date(report.incidentDate).toLocaleString()}
									</div>

									{/* Resident */}
									<div className="md:col-span-3">
										<div className="text-sm font-medium text-gray-900 truncate">
											{residentName}
										</div>
									</div>

									{/* Type / Severity */}
									<div className="md:col-span-4 flex items-center gap-2">
										<span className="text-sm text-gray-900 font-medium">
											{report.incidentType}
										</span>
										<span
											className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
												SEVERITY_COLORS[report.severity] ||
												'bg-gray-100 text-gray-800'
											}`}>
											{report.severity.toUpperCase()}
										</span>
									</div>

									{/* Attachments Indicator (Desktop) */}
									<div className="hidden md:block md:col-span-2 text-right">
										{report.attachments && report.attachments.length > 0 && (
											<span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
												📎 {report.attachments.length}
											</span>
										)}
									</div>
								</div>

								{/* Arrow Icon */}
								<div className="ml-2 flex-shrink-0 text-gray-400">
									<svg
										className={`h-5 w-5 transform transition-transform ${
											isExpanded ? 'rotate-180' : ''
										}`}
										viewBox="0 0 20 20"
										fill="currentColor">
										<path
											fillRule="evenodd"
											d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
											clipRule="evenodd"
										/>
									</svg>
								</div>
							</button>

							{/* Expanded Content */}
							{isExpanded && (
								<div className="border-t px-4 py-4 sm:px-6 bg-gray-50 rounded-b-lg">
									<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
										{/* LEFT: Description & Follow-up */}
										<div className="space-y-4">
											<div>
												<h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
													Description
												</h4>
												<p className="text-sm text-gray-800 whitespace-pre-wrap bg-white p-3 rounded border">
													{report.description}
												</p>
											</div>

											{report.actionTaken && (
												<div>
													<h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
														Action Taken
													</h4>
													<p className="text-sm text-gray-800 whitespace-pre-wrap bg-white p-3 rounded border">
														{report.actionTaken}
													</p>
												</div>
											)}
										</div>

										{/* RIGHT: Details & Metadata */}
										<div className="space-y-4">
											<div>
												<h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
													Details
												</h4>
												<dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
													<div className="flex justify-between">
														<dt className="text-gray-500">Reported By:</dt>
														<dd className="font-medium text-gray-900">
															{report.reportedByName || '-'}
														</dd>
													</div>
													<div className="flex justify-between">
														<dt className="text-gray-500">Location:</dt>
														<dd className="font-medium text-gray-900">
															{report.location || '-'}
														</dd>
													</div>
													{report.witnessNames && (
														<div className="flex justify-between">
															<dt className="text-gray-500">Witnesses:</dt>
															<dd className="font-medium text-gray-900 text-right">
																{report.witnessNames}
															</dd>
														</div>
													)}
												</dl>
											</div>

											{report.followUpRequired && (
												<div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
													<p className="text-yellow-800 font-medium mb-1">
														⚠️ Follow-up Required
													</p>
													{report.followUpNotes && (
														<p className="text-yellow-700 text-xs">
															{report.followUpNotes}
														</p>
													)}
												</div>
											)}

											{report.attachments && report.attachments.length > 0 && (
												<div>
													<h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
														Attachments
													</h4>
													<div className="space-y-2">
														{report.attachments.map((fileKey, index) => {
															const filename =
																fileKey.split('/').pop() ||
																`attachment-${index + 1}`;
															return (
																<div
																	key={index}
																	className="flex items-center justify-between bg-white p-2 rounded border text-sm">
																	<span className="text-gray-700 truncate max-w-[150px]">
																		📎 {filename.replace(/^\d+-[a-z0-9]+-/, '')}
																	</span>
																	<button
																		onClick={(e) =>
																			handleDownloadAttachment(fileKey, e)
																		}
																		className="text-blue-600 hover:text-blue-800 text-xs font-medium">
																		Download
																	</button>
																</div>
															);
														})}
													</div>
												</div>
											)}
										</div>
									</div>
								</div>
							)}
						</div>
					);
				})
			)}
		</div>
	);
}
