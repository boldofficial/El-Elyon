'use client';

import React, {useEffect, useMemo, useState} from 'react';
import {toast} from 'sonner';
import LifeSafetyInspectionWorkspace from './LifeSafetyInspectionWorkspace';

type SmokeCheck = {
	id?: string;
	location: string;
	date: string;
	smokeStatus: string;
	coStatus: string;
	staffInitials: string;
	notes?: string | null;
};

type FireDrill = {
	id?: string;
	location: string;
	year: number | string;
	sequence: number | string;
	residentName: string;
	date: string;
	time: string;
	staffName: string;
	comment?: string | null;
};

const formatDate = (value?: string) =>
	value ? new Date(value).toLocaleDateString() : '—';

export default function LifeSafetyDocuments() {
	const today = useMemo(() => new Date(), []);
	const currentYear = today.getFullYear().toString();
	const currentMonthValue = `${today.getFullYear()}-${String(
		today.getMonth() + 1
	).padStart(2, '0')}`;

	const [locations, setLocations] = useState<string[]>([]);
	const [residents, setResidents] = useState<any[]>([]);
	const [activeTab, setActiveTab] = useState<'smoke' | 'fire'>('smoke');

	const [smokeFilters, setSmokeFilters] = useState({
		location: 'all',
		month: currentMonthValue,
	});
	const [fireFilters, setFireFilters] = useState({
		location: 'all',
		year: currentYear,
		sequence: 'all',
	});

	const [smokeChecks] = useState<SmokeCheck[]>([]);
	const [fireDrills, setFireDrills] = useState<FireDrill[]>([]);
	const [loadingSmoke] = useState(false);
	const [loadingFire, setLoadingFire] = useState(false);

	const [smokeForm, setSmokeForm] = useState<SmokeCheck>({
		location: '',
		date: '',
		smokeStatus: 'Pass',
		coStatus: 'Pass',
		staffInitials: '', // Auto-populated by API
		notes: '',
	});
	const [fireForm, setFireForm] = useState<FireDrill>({
		location: '',
		year: currentYear,
		sequence: 1,
		residentName: '',
		date: '',
		time: '',
		staffName: '', // Auto-populated by API
		comment: '',
	});
	const [isSmokeModalOpen, setIsSmokeModalOpen] = useState(false);
	const [isFireModalOpen, setIsFireModalOpen] = useState(false);

	useEffect(() => {
		async function loadLocations() {
			try {
				// Try admin endpoint first, fallback to supervisor endpoint
				let res = await fetch('/api/admin/locations');
				let data;
				
				if (res.ok) {
					// Admin user - get all locations
					data = await res.json();
					const locationNames = data.map((loc: any) => loc.name);
					setLocations(locationNames || []);
				} else {
					// Supervisor user - get managed locations
					res = await fetch('/api/supervisor/managed-locations');
					if (!res.ok) throw new Error('Failed to load locations');
					data = await res.json();
					setLocations(data || []);
				}
				
				if (data?.length) {
					setSmokeFilters((prev) => ({...prev, location: prev.location || 'all'}));
					setFireFilters((prev) => ({...prev, location: prev.location || 'all'}));
				}
			} catch (error) {
				console.error(error);
				toast.error('Could not load locations');
			}
		}
		loadLocations();
	}, []);

	useEffect(() => {
		async function fetchFire() {
			setLoadingFire(true);
			try {
				const params = new URLSearchParams();
				if (fireFilters.location !== 'all') {
					params.set('location', fireFilters.location);
				}
				if (fireFilters.year) params.set('year', fireFilters.year.toString());
				if (fireFilters.sequence !== 'all')
					params.set('sequence', fireFilters.sequence.toString());
				params.set('limit', '200');

				const res = await fetch(`/api/documents/fire-drills?${params}`);
				if (!res.ok) throw new Error('Failed to fetch fire drills');
				const data = await res.json();
				setFireDrills(data || []);
			} catch (error) {
				console.error(error);
				toast.error('Could not load fire drills');
			} finally {
				setLoadingFire(false);
			}
		}
		fetchFire();
	}, [fireFilters]);

	const openSmokeModal = (record?: SmokeCheck) => {
		setSmokeForm(
			record
				? {
					...record,
					date: record.date ? record.date.slice(0, 10) : '',
				}
				: {
					location: smokeFilters.location !== 'all' ? smokeFilters.location : locations[0] || '',
					date: currentMonthValue + '-01',
					smokeStatus: 'Pass',
					coStatus: 'Pass',
					staffInitials: '',
					notes: '',
				}
		);
		setIsSmokeModalOpen(true);
	};

	const openFireModal = async (record?: FireDrill) => {
		const location = record?.location || (fireFilters.location !== 'all' ? fireFilters.location : locations[0] || '');
		setFireForm(
			record
				? {
					...record,
					date: record.date ? record.date.slice(0, 10) : '',
				}
				: {
					location,
					year: fireFilters.year || currentYear,
					sequence: 1,
					residentName: '',
					date: '',
					time: '',
					staffName: '',
					comment: '',
				}
		);
		
		// Fetch residents for the selected location
		if (location) {
			try {
				const res = await fetch(`/api/care/residents?location=${encodeURIComponent(location)}`);
				if (res.ok) {
					const data = await res.json();
					setResidents(data || []);
				}
			} catch (error) {
				console.error('Error loading residents:', error);
				setResidents([]);
			}
		}
		
		setIsFireModalOpen(true);
	};

	const handleSmokeSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const payload = {
				location: smokeForm.location,
				// date and staffInitials auto-populated by API
				smokeStatus: smokeForm.smokeStatus,
				coStatus: smokeForm.coStatus,
				notes: smokeForm.notes,
			};
			const isEdit = Boolean(smokeForm.id);
			const url = isEdit
				? `/api/documents/smoke-detector-checks/${smokeForm.id}`
				: '/api/documents/smoke-detector-checks';
			const method = isEdit ? 'PATCH' : 'POST';
			const res = await fetch(url, {
				method,
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(payload),
			});
			if (!res.ok) throw new Error('Save failed');
			toast.success(isEdit ? 'Updated check' : 'Added check');
			setIsSmokeModalOpen(false);
			setSmokeForm({
				location: '',
				date: '',
				smokeStatus: 'Pass',
				coStatus: 'Pass',
				staffInitials: '', // Auto-populated by API
				notes: '',
			});
			setSmokeFilters((prev) => ({...prev}));
		} catch (error) {
			console.error(error);
			toast.error('Could not save smoke detector check');
		}
	};

	const handleFireSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const payload = {
				location: fireForm.location,
				year: parseInt(fireForm.year as string, 10),
				sequence: parseInt(fireForm.sequence as string, 10),
				residentName: fireForm.residentName,
				// date, time, and staffName auto-populated by API
				comment: fireForm.comment,
			};
			const isEdit = Boolean(fireForm.id);
			const url = isEdit
				? `/api/documents/fire-drills/${fireForm.id}`
				: '/api/documents/fire-drills';
			const method = isEdit ? 'PATCH' : 'POST';
			const res = await fetch(url, {
				method,
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(payload),
			});
			if (!res.ok) throw new Error('Save failed');
			toast.success(isEdit ? 'Updated drill' : 'Added drill');
			setIsFireModalOpen(false);
			setFireForm({
				location: '',
				year: currentYear,
				sequence: 1,
				residentName: '',
				date: '',
				time: '',
				staffName: '', // Auto-populated by API // Auto-populated by API
				comment: '',
			});
			setFireFilters((prev) => ({...prev}));
		} catch (error) {
			console.error(error);
			toast.error('Could not save fire drill');
		}
	};

	const handleDeleteSmoke = async (id?: string) => {
		if (!id) return;
		if (!confirm('Delete this smoke detector check?')) return;
		try {
			const res = await fetch(`/api/documents/smoke-detector-checks/${id}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Delete failed');
			toast.success('Deleted check');
			setSmokeFilters((prev) => ({...prev}));
		} catch (error) {
			console.error(error);
			toast.error('Could not delete check');
		}
	};

	const handleDeleteFire = async (id?: string) => {
		if (!id) return;
		if (!confirm('Delete this fire drill?')) return;
		try {
			const res = await fetch(`/api/documents/fire-drills/${id}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Delete failed');
			toast.success('Deleted drill');
			setFireFilters((prev) => ({...prev}));
		} catch (error) {
			console.error(error);
			toast.error('Could not delete drill');
		}
	};

	const tabClass = (tab: 'smoke' | 'fire') =>
		`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
			activeTab === tab ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'
		}`;

	return (
		<div className="space-y-6">
			<div className="flex justify-between items-center">
				<div>
					<h2 className="text-2xl font-bold text-gray-900">Life-Safety Reports</h2>
					<p className="text-gray-600">Annual equipment inspections and fire drill reports</p>
				</div>
				<div className="flex bg-gray-100 rounded-lg p-1">
					<button className={tabClass('smoke')} onClick={() => setActiveTab('smoke')}>
						Inspections
					</button>
					<button className={tabClass('fire')} onClick={() => setActiveTab('fire')}>
						Fire Drills
					</button>
				</div>
			</div>

			{activeTab === 'smoke' ? (
				<LifeSafetyInspectionWorkspace />
			) : false ? (
				<div className="space-y-4">
					<div className="bg-white p-4 rounded-lg shadow-sm border grid grid-cols-1 md:grid-cols-4 gap-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
							<select
								value={smokeFilters.location}
								onChange={(e) => setSmokeFilters((prev) => ({...prev, location: e.target.value}))}
								className="w-full border border-gray-300 rounded-md px-3 py-2">
								<option value="all">All</option>
								{locations.map((loc) => (
									<option key={loc} value={loc}>
										{loc}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
							<input
								type="month"
								value={smokeFilters.month}
								onChange={(e) => setSmokeFilters((prev) => ({...prev, month: e.target.value}))}
								className="w-full border border-gray-300 rounded-md px-3 py-2"
							/>
						</div>
						<div className="flex items-end">
							<button
								onClick={() => openSmokeModal()}
								className="w-full md:w-auto inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
								Add Check
							</button>
						</div>
					</div>

					<div className="bg-white rounded-lg shadow-sm border overflow-hidden">
						{loadingSmoke ? (
							<div className="p-6 text-center text-gray-500">Loading...</div>
						) : smokeChecks.length === 0 ? (
							<div className="p-8 text-center text-gray-500">No checks found.</div>
						) : (
							<div className="overflow-x-auto">
								<table className="min-w-full divide-y divide-gray-200">
									<thead className="bg-gray-50">
										<tr>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Smoke Detector</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CO Detector</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Initials</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
											<th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
										</tr>
									</thead>
									<tbody className="bg-white divide-y divide-gray-200">
										{smokeChecks.map((check) => (
											<tr key={check.id} className="hover:bg-gray-50">
												<td className="px-6 py-3 text-sm text-gray-900">{formatDate(check.date)}</td>
												<td className="px-6 py-3 text-sm text-gray-700">{check.location}</td>
												<td className="px-6 py-3">
													<span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
														check.smokeStatus?.toLowerCase() === 'fail'
															? 'bg-red-100 text-red-800'
															: 'bg-green-100 text-green-800'
													}`}>{check.smokeStatus}</span>
												</td>
												<td className="px-6 py-3">
													<span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
														check.coStatus?.toLowerCase() === 'fail'
															? 'bg-red-100 text-red-800'
															: 'bg-green-100 text-green-800'
													}`}>{check.coStatus}</span>
												</td>
												<td className="px-6 py-3 text-sm text-gray-700">{check.staffInitials}</td>
												<td className="px-6 py-3 text-sm text-gray-500 max-w-xs truncate" title={check.notes || ''}>
													{check.notes || '—'}
												</td>
												<td className="px-6 py-3 text-right text-sm font-medium space-x-3">
													<button className="text-blue-600 hover:text-blue-800" onClick={() => openSmokeModal(check)}>
														Edit
													</button>
													<button className="text-red-600 hover:text-red-800" onClick={() => handleDeleteSmoke(check.id)}>
														Delete
													</button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			) : (
				<div className="space-y-4">
					<div className="bg-white p-4 rounded-lg shadow-sm border grid grid-cols-1 md:grid-cols-5 gap-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
							<select
								value={fireFilters.location}
								onChange={(e) => setFireFilters((prev) => ({...prev, location: e.target.value}))}
								className="w-full border border-gray-300 rounded-md px-3 py-2">
								<option value="all">All</option>
								{locations.map((loc) => (
									<option key={loc} value={loc}>
										{loc}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
							<input
								type="number"
								min="2020"
								value={fireFilters.year}
								onChange={(e) => setFireFilters((prev) => ({...prev, year: e.target.value}))}
								className="w-full border border-gray-300 rounded-md px-3 py-2"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">Sequence</label>
							<select
								value={fireFilters.sequence}
								onChange={(e) => setFireFilters((prev) => ({...prev, sequence: e.target.value}))}
								className="w-full border border-gray-300 rounded-md px-3 py-2">
								<option value="all">All</option>
								<option value="1">1st (Jan-Jun)</option>
								<option value="2">2nd (Jul-Dec)</option>
							</select>
						</div>
						<div className="flex items-end">
							<button
								onClick={() => openFireModal()}
								className="w-full md:w-auto inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
								Add Drill
							</button>
						</div>
					</div>

					<div className="bg-white rounded-lg shadow-sm border overflow-hidden">
						{loadingFire ? (
							<div className="p-6 text-center text-gray-500">Loading...</div>
						) : fireDrills.length === 0 ? (
							<div className="p-8 text-center text-gray-500">No fire drills found.</div>
						) : (
							<div className="overflow-x-auto">
								<table className="min-w-full divide-y divide-gray-200">
									<thead className="bg-gray-50">
										<tr>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Year / Seq</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date / Time</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resident</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Staff</th>
											<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comment</th>
											<th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
										</tr>
									</thead>
									<tbody className="bg-white divide-y divide-gray-200">
										{fireDrills.map((drill) => (
											<tr key={drill.id} className="hover:bg-gray-50">
												<td className="px-6 py-3 text-sm text-gray-900">
													<div className="font-medium">{drill.year}</div>
													<div className="text-xs text-gray-500">Seq {drill.sequence}</div>
												</td>
												<td className="px-6 py-3 text-sm text-gray-700">
													<div>{formatDate(drill.date)}</div>
													<div className="text-xs text-gray-500">{drill.time || '—'}</div>
												</td>
												<td className="px-6 py-3 text-sm text-gray-700">{drill.location}</td>
												<td className="px-6 py-3 text-sm text-gray-700">{drill.residentName}</td>
												<td className="px-6 py-3 text-sm text-gray-700">{drill.staffName}</td>
												<td className="px-6 py-3 text-sm text-gray-500 max-w-xs truncate" title={drill.comment || ''}>
													{drill.comment || '—'}
												</td>
												<td className="px-6 py-3 text-right text-sm font-medium space-x-3">
													<button className="text-blue-600 hover:text-blue-800" onClick={() => openFireModal(drill)}>
														Edit
													</button>
													<button className="text-red-600 hover:text-red-800" onClick={() => handleDeleteFire(drill.id)}>
														Delete
													</button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			)}

			{isSmokeModalOpen && (
				<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
					<div className="bg-white rounded-lg shadow-lg w-full max-w-xl p-6 space-y-4">
						<div className="flex items-center justify-between">
							<h3 className="text-lg font-semibold">
								{smokeForm.id ? 'Edit Smoke Detector Check' : 'Add Smoke Detector Check'}
							</h3>
							<button
								onClick={() => setIsSmokeModalOpen(false)}
								className="text-gray-500 hover:text-gray-700">
									Close
								</button>
						</div>
						<form className="space-y-3" onSubmit={handleSmokeSubmit}>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
									<select
										value={smokeForm.location}
										onChange={(e) => setSmokeForm((prev) => ({...prev, location: e.target.value}))}
										className="w-full border border-gray-300 rounded-md px-3 py-2"
										required>
										<option value="">Select location</option>
										{locations.map((loc) => (
											<option key={loc} value={loc}>
												{loc}
											</option>
										))}
									</select>
								</div>
								<div>

									<label className="block text-sm font-medium text-gray-700 mb-1">Smoke Detector Status</label>
									<select
										value={smokeForm.smokeStatus}
										onChange={(e) => setSmokeForm((prev) => ({...prev, smokeStatus: e.target.value}))}
										className="w-full border border-gray-300 rounded-md px-3 py-2"
										required>
										<option value="Pass">Pass</option>
										<option value="Fail">Fail</option>
									</select>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">CO Detector Status</label>
									<select
										value={smokeForm.coStatus}
										onChange={(e) => setSmokeForm((prev) => ({...prev, coStatus: e.target.value}))}
										className="w-full border border-gray-300 rounded-md px-3 py-2"
										required>
										<option value="Pass">Pass</option>
										<option value="Fail">Fail</option>
									</select>
								</div>
							<div className="md:col-span-2">
									<label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
									<textarea
										value={smokeForm.notes || ''}
										onChange={(e) => setSmokeForm((prev) => ({...prev, notes: e.target.value}))}
										className="w-full border border-gray-300 rounded-md px-3 py-2"
										rows={3}
										placeholder="Optional"
									/>
								</div>
							</div>
							<div className="flex justify-end gap-3 pt-2">
								<button
									type="button"
									onClick={() => setIsSmokeModalOpen(false)}
									className="px-4 py-2 rounded-md border border-gray-300 text-gray-700">
										Cancel
									</button>
								<button
									type="submit"
									className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
										{smokeForm.id ? 'Update' : 'Save'}
									</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{isFireModalOpen && (
				<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
					<div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-6 space-y-4">
						<div className="flex items-center justify-between">
							<h3 className="text-lg font-semibold">
								{fireForm.id ? 'Edit Fire Drill' : 'Add Fire Drill'}
							</h3>
							<button
								onClick={() => setIsFireModalOpen(false)}
								className="text-gray-500 hover:text-gray-700">
									Close
								</button>
						</div>
						<form className="space-y-3" onSubmit={handleFireSubmit}>
							<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
									<select
										value={fireForm.location}
										onChange={async (e) => {
											const newLocation = e.target.value;
											setFireForm((prev) => ({...prev, location: newLocation, residentName: ''}));
											// Fetch residents for new location
											if (newLocation) {
												try {
													const res = await fetch(`/api/care/residents?location=${encodeURIComponent(newLocation)}`);
													if (res.ok) {
														const data = await res.json();
														setResidents(data || []);
													}
												} catch (error) {
													console.error('Error loading residents:', error);
													setResidents([]);
												}
											} else {
												setResidents([]);
											}
										}}
										className="w-full border border-gray-300 rounded-md px-3 py-2"
										required>
										<option value="">Select location</option>
										{locations.map((loc) => (
											<option key={loc} value={loc}>
												{loc}
											</option>
										))}
									</select>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
									<input
										type="number"
										min="2020"
										value={fireForm.year}
										onChange={(e) => setFireForm((prev) => ({...prev, year: e.target.value}))}
										className="w-full border border-gray-300 rounded-md px-3 py-2"
										required
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Sequence</label>
									<select
										value={fireForm.sequence}
										onChange={(e) => setFireForm((prev) => ({...prev, sequence: e.target.value}))}
										className="w-full border border-gray-300 rounded-md px-3 py-2"
										required>
										<option value="1">1st (Jan-Jun)</option>
										<option value="2">2nd (Jul-Dec)</option>
									</select>
								</div>
							</div>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Resident Name</label>
									<select
										value={fireForm.residentName}
										onChange={(e) => setFireForm((prev) => ({...prev, residentName: e.target.value}))}
										className="w-full border border-gray-300 rounded-md px-3 py-2"
										required
										disabled={!fireForm.location}>
										<option value="">Select resident</option>
										{residents.map((res) => (
											<option key={res.id} value={res.name}>
												{res.name}
											</option>
										))}
									</select>
									{!fireForm.location && (
										<p className="text-xs text-gray-500 mt-1">Select a location first</p>
									)}
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Comment</label>
								<textarea
									value={fireForm.comment || ''}
									onChange={(e) => setFireForm((prev) => ({...prev, comment: e.target.value}))}
									className="w-full border border-gray-300 rounded-md px-3 py-2"
									rows={3}
									placeholder="Optional"
								/>
							</div>
							<div className="flex justify-end gap-3 pt-2">
								<button
									type="button"
									onClick={() => setIsFireModalOpen(false)}
									className="px-4 py-2 rounded-md border border-gray-300 text-gray-700">
										Cancel
									</button>
								<button
									type="submit"
									className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
										{fireForm.id ? 'Update' : 'Save'}
									</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
