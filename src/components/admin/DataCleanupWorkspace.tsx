'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

interface OrphanedRecord {
	id: string;
	reason: string;
	[key: string]: any;
}

interface ScanResults {
	totalOrphaned: number;
	summary: Record<string, number>;
	orphanedData: Record<string, OrphanedRecord[]>;
}

export function DataCleanupWorkspace() {
	const [scanning, setScanning] = useState(false);
	const [cleaning, setCleaning] = useState(false);
	const [scanResults, setScanResults] = useState<ScanResults | null>(null);
	const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
		new Set()
	);

	const fetchScanResults = async () => {
		setScanning(true);
		try {
			const res = await fetch('/api/admin/cleanup/scan');
			if (!res.ok) {
				throw new Error(`HTTP error! status: ${res.status}`);
			}
			const data: ScanResults = await res.json();
			setScanResults(data);
		} catch (error: any) {
			console.error('Error scanning for orphaned data:', error);
			toast.error(error.message || 'Failed to scan for orphaned data.');
		} finally {
			setScanning(false);
		}
	};

	useEffect(() => {
		fetchScanResults();
	}, []);

	const handleCleanup = async () => {
		if (selectedCategories.size === 0) {
			toast.error('Please select at least one category to clean up');
			return;
		}

		if (
			!confirm(
				`Are you sure you want to delete orphaned data from ${selectedCategories.size} categories? This action cannot be undone.`
			)
		) {
			return;
		}

		setCleaning(true);
		try {
			const res = await fetch('/api/admin/cleanup/run', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({categories: Array.from(selectedCategories)}),
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to cleanup orphaned data.');
			}

			const result = await res.json();
			toast.success(
				`Successfully cleaned up ${result.deletedCount} orphaned records`
			);
			setSelectedCategories(new Set());
			await fetchScanResults(); // Re-scan after cleanup
		} catch (error: any) {
			console.error('Error cleaning up orphaned data:', error);
			toast.error(error.message || 'Failed to cleanup orphaned data.');
		} finally {
			setCleaning(false);
		}
	};

	const toggleCategory = (category: string) => {
		const newSelected = new Set(selectedCategories);
		if (newSelected.has(category)) {
			newSelected.delete(category);
		} else {
			newSelected.add(category);
		}
		setSelectedCategories(newSelected);
	};

	const selectAll = () => {
		if (scanResults?.summary) {
			const allCategories = Object.keys(scanResults.summary).filter(
				(key) => (scanResults.summary as any)[key] > 0
			);
			setSelectedCategories(new Set(allCategories));
		}
	};

	const deselectAll = () => {
		setSelectedCategories(new Set());
	};

	const categoryLabels: Record<string, string> = {
		roles: 'Roles',
		shifts: 'Shifts',
		residentLogs: 'Resident Logs',
		auditLogs: 'Audit Logs',
		ispFiles: 'ISP Files',
		ispAccessLogs: 'ISP Access Logs',
		ispAcknowledgments: 'ISP Acknowledgments',
		fireEvac: 'Fire Evacuation Plans',
		guardianChecklistLinks: 'Guardian Checklist Links',
		guardians: 'Guardians (with orphaned resident refs)',
		complianceAlerts: 'Compliance Alerts',
		kiosks: 'Kiosks',
	};

	return (
		<div className="p-6 max-w-6xl mx-auto">
			<div className="mb-6">
				<h1 className="text-3xl font-bold text-gray-900 mb-2">
					Data Cleanup Tool
				</h1>
				<p className="text-gray-600">
					Scan and remove orphaned data that references non-existent records
				</p>
			</div>

			{/* Scan Button */}
			<div className="mb-6">
				<button
					onClick={fetchScanResults}
					disabled={scanning}
					className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
				>
					{scanning ? 'Scanning...' : 'Scan for Orphaned Data'}
				</button>
			</div>

			{/* Results */}
			{scanResults && (
				<div className="space-y-6">
					{/* Summary Card */}
					<div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
						<h2 className="text-xl font-semibold mb-4">Scan Results</h2>
						<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
							<div className="text-center p-4 bg-gray-50 rounded-lg">
								<div className="text-3xl font-bold text-blue-600">
									{scanResults.totalOrphaned}
								</div>
								<div className="text-sm text-gray-600 mt-1">
									Total Orphaned
								</div>
							</div>
							{Object.entries(scanResults.summary).map(([key, count]) => (
								(count as number) > 0 && (
									<div key={key} className="text-center p-4 bg-red-50 rounded-lg">
										<div className="text-2xl font-bold text-red-600">
											{count as number}
										</div>
										<div className="text-sm text-gray-600 mt-1">
											{categoryLabels[key]}
										</div>
									</div>
								)
							))}
						</div>
					</div>

					{/* Category Selection */}
					{scanResults.totalOrphaned > 0 && (
						<div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
							<div className="flex justify-between items-center mb-4">
								<h2 className="text-xl font-semibold">
									Select Categories to Clean
								</h2>
								<div className="space-x-2">
									<button
										onClick={selectAll}
										className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
									>
										Select All
									</button>
									<button
										onClick={deselectAll}
										className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
									>
										Deselect All
									</button>
								</div>
							</div>

							<div className="space-y-3">
								{Object.entries(scanResults.summary).map(([key, count]) => (
									(count as number) > 0 && (
										<label
											key={key}
											className="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
										>
											<input
												type="checkbox"
												checked={selectedCategories.has(key)}
												onChange={() => toggleCategory(key)}
												className="w-5 h-5 text-blue-600 rounded mr-3"
											/>
											<div className="flex-1">
												<div className="font-medium">{categoryLabels[key]}</div>
												<div className="text-sm text-gray-600">
													{count as number} orphaned record
													{(count as number) !== 1 ? 's' : ''}
												</div>
											</div>
										</label>
									)
								))}
							</div>

							{/* Cleanup Button */}
							<div className="mt-6 pt-6 border-t">
								<button
									onClick={handleCleanup}
									disabled={cleaning || selectedCategories.size === 0}
									className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
								>
									{cleaning
										? 'Cleaning...'
										: `Delete ${
												selectedCategories.size > 0
													? `${Array.from(selectedCategories).reduce(
															(sum, cat) =>
																sum + ((scanResults.summary as any)[cat] || 0),
															0
													  )} Orphaned Records`
													: 'Selected Records'
										  }`}
								</button>
								<p className="text-sm text-gray-500 mt-2 text-center">
									⚠️ This action cannot be undone. Please review carefully
									before proceeding.
								</p>
							</div>
						</div>
					)}

					{/* Detailed View */}
					{scanResults.totalOrphaned > 0 && (
						<div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
							<h2 className="text-xl font-semibold mb-4">Detailed View</h2>
							<div className="space-y-4">
								{Object.entries(scanResults.orphanedData).map(
									([category, items]) =>
										(items as any[]).length > 0 && (
											<details key={category} className="border rounded-lg">
												<summary className="p-4 cursor-pointer hover:bg-gray-50 font-medium">
													{categoryLabels[category]} ({(items as any[]).length})
												</summary>
												<div className="p-4 border-t bg-gray-50 max-h-96 overflow-y-auto">
													<div className="space-y-2">
														{(items as any[]).map((item, idx) => (
															<div
																key={idx}
																className="p-3 bg-white rounded border text-sm"
															>
																<div className="font-mono text-xs text-gray-500 mb-1">
																	ID: {item.id}
																</div>
																<div className="text-red-600 font-medium">
																	{item.reason}
																</div>
																<div className="text-gray-600 mt-1">
																	{Object.entries(item)
																		.filter(
																			([k]) => k !== 'id' && k !== 'reason'
																		)
																		.map(([k, v]) => (
																			<div key={k}>
																				<span className="font-medium">{k}:</span>{' '}
																				{String(v)}
																			</div>
																		))}
																</div>
															</div>
														))}
													</div>
												</div>
											</details>
										)
								)}
							</div>
						</div>
					)}

					{/* No Orphaned Data */}
					{scanResults.totalOrphaned === 0 && (
						<div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
							<div className="text-green-600 text-xl font-semibold mb-2">
								✓ No Orphaned Data Found
							</div>
							<p className="text-gray-600">
								Your database is clean and all references are valid.
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
