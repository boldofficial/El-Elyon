// src/components/shared/StaffDocumentsWorkspace.tsx
// Staff documents for state inspectors. Admins upload and remove; supervisors
// with "View Staff Documents" see and download what's at their own locations.
// The server decides both what's listed and whether upload controls show
// (canUpload) — this component never infers access on its own.

'use client';

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {toast} from 'sonner';
import {
	STAFF_DOCUMENT_CATEGORIES,
	STAFF_DOCUMENT_CATEGORY_LABELS,
	STAFF_DOCUMENT_CATEGORY_SCOPE,
	STAFF_DOCUMENT_MAX_BYTES,
	type StaffDocumentCategory,
} from '@/lib/staff-documents';

interface StaffDocument {
	id: string;
	category: StaffDocumentCategory;
	employeeId: string | null;
	employeeName: string | null;
	location: string | null;
	title: string;
	notes: string | null;
	fileName: string;
	fileSize: number;
	uploadedAt: string;
}

interface EmployeeOption {
	id: string;
	name: string;
	locations: string[];
}

interface StaffDocumentsResponse {
	documents: StaffDocument[];
	employees: EmployeeOption[];
	locations: string[];
	canUpload: boolean;
}

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png';

function formatSize(bytes: number) {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StaffDocumentsWorkspace({
	employeeId,
}: {
	// When set, the workspace is embedded on one employee's HR page: only
	// their documents are listed and uploads are filed under them.
	employeeId?: string;
}) {
	const [data, setData] = useState<StaffDocumentsResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);

	const [categoryFilter, setCategoryFilter] = useState<'' | StaffDocumentCategory>('');
	const [employeeFilter, setEmployeeFilter] = useState('');
	const [locationFilter, setLocationFilter] = useState('');
	const [search, setSearch] = useState('');

	const fetchDocuments = useCallback(async () => {
		setLoading(true);
		try {
			const query = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
			const res = await fetch(`/api/staff-documents${query}`);
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error || 'Failed to load staff documents');
			setData(body);
			setLoadError(null);
		} catch (error: any) {
			setLoadError(error.message || 'Failed to load staff documents');
		} finally {
			setLoading(false);
		}
	}, [employeeId]);

	useEffect(() => {
		void fetchDocuments();
	}, [fetchDocuments]);

	const filtered = useMemo(() => {
		if (!data) return [];
		const needle = search.trim().toLowerCase();
		return data.documents.filter((doc) => {
			if (categoryFilter && doc.category !== categoryFilter) return false;
			if (employeeFilter && doc.employeeId !== employeeFilter) return false;
			if (locationFilter) {
				// A location filter shows that house's facility documents plus
				// documents of everyone who works there.
				const employee = data.employees.find((e) => e.id === doc.employeeId);
				const atLocation =
					doc.location === locationFilter ||
					(employee?.locations || []).includes(locationFilter);
				if (!atLocation) return false;
			}
			if (!needle) return true;
			return [doc.title, doc.fileName, doc.employeeName, doc.location, doc.notes]
				.filter(Boolean)
				.some((value) => value!.toLowerCase().includes(needle));
		});
	}, [data, categoryFilter, employeeFilter, locationFilter, search]);

	async function archiveDocument(doc: StaffDocument) {
		if (!window.confirm(`Remove "${doc.title}"? Supervisors will no longer see it.`)) return;
		const res = await fetch(`/api/staff-documents/${doc.id}`, {method: 'DELETE'});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			toast.error(body.error || 'Failed to remove document');
			return;
		}
		toast.success('Document removed');
		void fetchDocuments();
	}

	if (loading && !data) {
		return <div className="p-6 text-gray-500">Loading staff documents…</div>;
	}
	if (loadError || !data) {
		return (
			<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
				{loadError || 'Failed to load staff documents'}
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{!employeeId && (
				<div>
					<h2 className="text-xl font-semibold text-gray-900">Staff Documents</h2>
					<p className="text-sm text-gray-600">
						Personnel records for state inspectors.{' '}
						{data.canUpload
							? 'Supervisors you grant "View Staff Documents" can download what is at their own locations.'
							: 'Showing staff at your locations. Every download is logged.'}
					</p>
				</div>
			)}

			{data.canUpload && (
				<UploadForm
					employees={data.employees}
					locations={data.locations}
					fixedEmployeeId={employeeId}
					onUploaded={fetchDocuments}
				/>
			)}

			<div className="flex flex-wrap gap-3">
				<input
					type="search"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search title, file or name"
					className="min-w-[14rem] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
				/>
				<select
					value={categoryFilter}
					onChange={(e) => setCategoryFilter(e.target.value as '' | StaffDocumentCategory)}
					className="rounded-md border border-gray-300 px-3 py-2 text-sm">
					<option value="">All categories</option>
					{STAFF_DOCUMENT_CATEGORIES.map((category) => (
						<option key={category} value={category}>
							{STAFF_DOCUMENT_CATEGORY_LABELS[category]}
						</option>
					))}
				</select>
				{!employeeId && (
					<>
						<select
							value={employeeFilter}
							onChange={(e) => setEmployeeFilter(e.target.value)}
							className="rounded-md border border-gray-300 px-3 py-2 text-sm">
							<option value="">All employees</option>
							{data.employees.map((employee) => (
								<option key={employee.id} value={employee.id}>
									{employee.name}
								</option>
							))}
						</select>
						<select
							value={locationFilter}
							onChange={(e) => setLocationFilter(e.target.value)}
							className="rounded-md border border-gray-300 px-3 py-2 text-sm">
							<option value="">All locations</option>
							{data.locations.map((location) => (
								<option key={location} value={location}>
									{location}
								</option>
							))}
						</select>
					</>
				)}
			</div>

			<div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
				<table className="min-w-full divide-y divide-gray-200 text-sm">
					<thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
						<tr>
							<th className="px-4 py-3">Document</th>
							<th className="px-4 py-3">Category</th>
							{!employeeId && <th className="px-4 py-3">Filed under</th>}
							<th className="px-4 py-3">Uploaded</th>
							<th className="px-4 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-100">
						{filtered.length === 0 ? (
							<tr>
								<td colSpan={employeeId ? 4 : 5} className="px-4 py-8 text-center text-gray-500">
									{data.documents.length === 0
										? 'No staff documents yet.'
										: 'No documents match these filters.'}
								</td>
							</tr>
						) : (
							filtered.map((doc) => (
								<tr key={doc.id} className="align-top">
									<td className="px-4 py-3">
										<div className="font-medium text-gray-900">{doc.title}</div>
										<div className="text-xs text-gray-500">
											{doc.fileName} · {formatSize(doc.fileSize)}
										</div>
										{doc.notes && (
											<div className="mt-1 text-xs text-gray-600">{doc.notes}</div>
										)}
									</td>
									<td className="px-4 py-3 text-gray-700">
										{STAFF_DOCUMENT_CATEGORY_LABELS[doc.category] ?? doc.category}
									</td>
									{!employeeId && (
										<td className="px-4 py-3 text-gray-700">
											{doc.employeeName ?? (
												<span>
													{doc.location}{' '}
													<span className="text-xs text-gray-500">(facility)</span>
												</span>
											)}
										</td>
									)}
									<td className="whitespace-nowrap px-4 py-3 text-gray-700">
										{new Date(doc.uploadedAt).toLocaleDateString()}
									</td>
									<td className="whitespace-nowrap px-4 py-3 text-right">
										<a
											href={`/api/staff-documents/${doc.id}/download`}
											target="_blank"
											rel="noopener noreferrer"
											className="font-medium text-blue-600 hover:underline">
											Download
										</a>
										{data.canUpload && (
											<button
												type="button"
												onClick={() => void archiveDocument(doc)}
												className="ml-4 font-medium text-red-600 hover:underline">
												Remove
											</button>
										)}
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function UploadForm({
	employees,
	locations,
	fixedEmployeeId,
	onUploaded,
}: {
	employees: EmployeeOption[];
	locations: string[];
	fixedEmployeeId?: string;
	onUploaded: () => void;
}) {
	// On an employee's own page only employee-filed categories make sense.
	const categories = STAFF_DOCUMENT_CATEGORIES.filter(
		(category) => !fixedEmployeeId || STAFF_DOCUMENT_CATEGORY_SCOPE[category] !== 'location'
	);

	const [category, setCategory] = useState<StaffDocumentCategory>(categories[0]);
	const [miscTarget, setMiscTarget] = useState<'employee' | 'location'>('employee');
	const [employeeId, setEmployeeId] = useState(fixedEmployeeId ?? '');
	const [location, setLocation] = useState('');
	const [title, setTitle] = useState('');
	const [notes, setNotes] = useState('');
	const [file, setFile] = useState<File | null>(null);
	const [uploading, setUploading] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);

	const scope = STAFF_DOCUMENT_CATEGORY_SCOPE[category];
	const target = fixedEmployeeId ? 'employee' : scope === 'either' ? miscTarget : scope;

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!file) {
			toast.error('Choose a file to upload');
			return;
		}
		if (file.size > STAFF_DOCUMENT_MAX_BYTES) {
			toast.error('File is larger than 4 MB. Split or compress the scan and try again.');
			return;
		}

		const form = new FormData();
		form.append('file', file);
		form.append('category', category);
		if (target === 'employee') form.append('employeeId', employeeId);
		else form.append('location', location);
		form.append('title', title);
		form.append('notes', notes);

		setUploading(true);
		try {
			const res = await fetch('/api/staff-documents', {method: 'POST', body: form});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error || 'Upload failed');
			toast.success('Document uploaded');
			setTitle('');
			setNotes('');
			setFile(null);
			if (fileInput.current) fileInput.current.value = '';
			onUploaded();
		} catch (error: any) {
			toast.error(error.message || 'Upload failed');
		} finally {
			setUploading(false);
		}
	}

	return (
		<form onSubmit={submit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
			<h3 className="font-semibold text-gray-900">Upload a document</h3>
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="block text-sm">
					<span className="mb-1 block font-medium text-gray-700">Category</span>
					<select
						value={category}
						onChange={(e) => setCategory(e.target.value as StaffDocumentCategory)}
						className="w-full rounded-md border border-gray-300 px-3 py-2">
						{categories.map((option) => (
							<option key={option} value={option}>
								{STAFF_DOCUMENT_CATEGORY_LABELS[option]}
							</option>
						))}
					</select>
				</label>

				{!fixedEmployeeId && (
					<div className="text-sm">
						<span className="mb-1 block font-medium text-gray-700">
							{target === 'employee' ? 'Employee' : 'Location'}
							{scope === 'either' && (
								<span className="ml-2 font-normal">
									<button
										type="button"
										onClick={() => setMiscTarget(miscTarget === 'employee' ? 'location' : 'employee')}
										className="text-xs text-blue-600 hover:underline">
										file under a {miscTarget === 'employee' ? 'location' : 'person'} instead
									</button>
								</span>
							)}
						</span>
						{target === 'employee' ? (
							<select
								value={employeeId}
								onChange={(e) => setEmployeeId(e.target.value)}
								required
								className="w-full rounded-md border border-gray-300 px-3 py-2">
								<option value="">Choose an employee</option>
								{employees.map((employee) => (
									<option key={employee.id} value={employee.id}>
										{employee.name}
									</option>
								))}
							</select>
						) : (
							<select
								value={location}
								onChange={(e) => setLocation(e.target.value)}
								required
								className="w-full rounded-md border border-gray-300 px-3 py-2">
								<option value="">Choose a location</option>
								{locations.map((name) => (
									<option key={name} value={name}>
										{name}
									</option>
								))}
							</select>
						)}
					</div>
				)}

				<label className="block text-sm">
					<span className="mb-1 block font-medium text-gray-700">Title (optional)</span>
					<input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						maxLength={255}
						placeholder="Defaults to the file name"
						className="w-full rounded-md border border-gray-300 px-3 py-2"
					/>
				</label>

				<label className="block text-sm">
					<span className="mb-1 block font-medium text-gray-700">File (max 4 MB)</span>
					<input
						ref={fileInput}
						type="file"
						accept={ACCEPT}
						onChange={(e) => setFile(e.target.files?.[0] ?? null)}
						className="w-full text-sm"
					/>
				</label>

				<label className="block text-sm sm:col-span-2">
					<span className="mb-1 block font-medium text-gray-700">Notes (optional)</span>
					<input
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						placeholder="e.g. expires 03/2027"
						className="w-full rounded-md border border-gray-300 px-3 py-2"
					/>
				</label>
			</div>
			<button
				type="submit"
				disabled={uploading}
				className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
				{uploading ? 'Uploading…' : 'Upload'}
			</button>
		</form>
	);
}
