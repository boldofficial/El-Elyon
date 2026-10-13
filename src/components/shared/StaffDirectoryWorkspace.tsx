// src/components/shared/StaffDirectoryWorkspace.tsx
// Staff Directory for state inspectors: homes → a home's roster and its own
// compliance documents → a staff member's profile and documents.
//
// Admins edit rosters and profiles and upload; supervisors with "View Staff
// Directory" browse their own homes read-only. Every rule is enforced by
// the server — canEdit in each response only decides which controls render.

'use client';

import React, {useCallback, useEffect, useState} from 'react';
import {toast} from 'sonner';
import StaffDocumentsWorkspace from './StaffDocumentsWorkspace';
import {STAFF_SEX_LABELS, STAFF_SEX_OPTIONS} from '@/lib/staff-directory';

type View =
	| {kind: 'homes'}
	| {kind: 'all-documents'}
	| {kind: 'home'; name: string}
	| {kind: 'staff'; employeeId: string; fromHome?: string};

interface HomeSummary {
	name: string;
	address: string | null;
	phone: string | null;
	staffCount: number;
	documentCount: number;
}

interface RosterRow {
	entryId: string;
	employeeId: string;
	name: string;
	title: string | null;
	rosterHireDate: string | null;
	employmentStatus: string | null;
	phone: string | null;
}

interface HomeDetail {
	home: {name: string; address: string | null; phone: string | null};
	roster: RosterRow[];
	addable: {id: string; name: string}[];
	canEdit: boolean;
}

interface StaffProfile {
	id: string;
	name: string;
	email: string | null;
	workEmail: string | null;
	phone: string | null;
	dateOfBirth: string | null;
	sex: string | null;
	homeAddress: string | null;
	dateOfHire: string | null;
	employmentStatus: string | null;
	emergencyContactName: string | null;
	emergencyContactPhone: string | null;
	emergencyContactRelationship: string | null;
	profileNotes: string | null;
	homes: {location: string; title: string | null; rosterHireDate: string | null}[];
	canEdit: boolean;
}

// Calendar dates are stored as YYYY-MM-DD; show them without a timezone shift.
function formatDate(value: string | null) {
	if (!value) return '—';
	const [y, m, d] = value.split('-');
	return `${m}/${d}/${y}`;
}

function StatusBadge({status}: {status: string | null}) {
	const active = (status || 'active') === 'active';
	return (
		<span
			className={`rounded-full px-2 py-0.5 text-xs font-medium ${
				active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
			}`}>
			{status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Active'}
		</span>
	);
}

async function readJson(res: Response) {
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.error || 'Request failed');
	return body;
}

export default function StaffDirectoryWorkspace() {
	const [view, setView] = useState<View>({kind: 'homes'});

	if (view.kind === 'home') {
		return (
			<HomeView
				name={view.name}
				onBack={() => setView({kind: 'homes'})}
				onOpenStaff={(employeeId) => setView({kind: 'staff', employeeId, fromHome: view.name})}
			/>
		);
	}
	if (view.kind === 'staff') {
		return (
			<StaffView
				employeeId={view.employeeId}
				backLabel={view.fromHome ?? 'Staff Directory'}
				onBack={() =>
					setView(view.fromHome ? {kind: 'home', name: view.fromHome} : {kind: 'homes'})
				}
			/>
		);
	}
	if (view.kind === 'all-documents') {
		return (
			<div className="space-y-4">
				<BackLink label="Staff Directory" onClick={() => setView({kind: 'homes'})} />
				<StaffDocumentsWorkspace />
			</div>
		);
	}
	return (
		<HomesView
			onOpenHome={(name) => setView({kind: 'home', name})}
			onOpenAllDocuments={() => setView({kind: 'all-documents'})}
		/>
	);
}

function BackLink({label, onClick}: {label: string; onClick: () => void}) {
	return (
		<button type="button" onClick={onClick} className="text-sm text-blue-600 hover:underline">
			← {label}
		</button>
	);
}

function ErrorBox({message}: {message: string}) {
	return (
		<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{message}</div>
	);
}

// ── Level 1: homes ─────────────────────────────────────────────────────────

function HomesView({
	onOpenHome,
	onOpenAllDocuments,
}: {
	onOpenHome: (name: string) => void;
	onOpenAllDocuments: () => void;
}) {
	const [data, setData] = useState<{homes: HomeSummary[]; canEdit: boolean} | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch('/api/staff-directory')
			.then(readJson)
			.then(setData)
			.catch((e) => setError(e.message));
	}, []);

	if (error) return <ErrorBox message={error} />;
	if (!data) return <div className="p-6 text-gray-500">Loading staff directory…</div>;

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold text-gray-900">Staff Directory</h2>
					<p className="text-sm text-gray-600">
						Staff rosters, profiles and personnel documents for state inspectors.
						{!data.canEdit && ' Showing your homes. Every download is logged.'}
					</p>
				</div>
				<button
					type="button"
					onClick={onOpenAllDocuments}
					className="text-sm font-medium text-blue-600 hover:underline">
					Search all documents →
				</button>
			</div>

			{data.homes.length === 0 ? (
				<p className="text-gray-500">No homes to show.</p>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{data.homes.map((home) => (
						<button
							key={home.name}
							type="button"
							onClick={() => onOpenHome(home.name)}
							className="rounded-lg border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-400 hover:shadow">
							<div className="font-semibold text-gray-900">{home.name}</div>
							{home.address && <div className="mt-1 text-sm text-gray-600">{home.address}</div>}
							{home.phone && <div className="text-sm text-gray-600">{home.phone}</div>}
							<div className="mt-3 flex gap-4 text-sm text-gray-700">
								<span>
									<strong>{home.staffCount}</strong> on roster
								</span>
								<span>
									<strong>{home.documentCount}</strong> home documents
								</span>
							</div>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

// ── Level 2: one home ──────────────────────────────────────────────────────

function HomeView({
	name,
	onBack,
	onOpenStaff,
}: {
	name: string;
	onBack: () => void;
	onOpenStaff: (employeeId: string) => void;
}) {
	const [data, setData] = useState<HomeDetail | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(() => {
		fetch(`/api/staff-directory/home?name=${encodeURIComponent(name)}`)
			.then(readJson)
			.then((body) => {
				setData(body);
				setError(null);
			})
			.catch((e) => setError(e.message));
	}, [name]);

	useEffect(() => {
		load();
	}, [load]);

	async function removeFromRoster(row: RosterRow) {
		if (!window.confirm(`Take ${row.name} off the ${name} roster? Their profile, documents and app access stay as they are.`)) {
			return;
		}
		try {
			await readJson(await fetch(`/api/staff-directory/roster/${row.entryId}`, {method: 'DELETE'}));
			toast.success(`${row.name} removed from the roster`);
			load();
		} catch (e: any) {
			toast.error(e.message);
		}
	}

	return (
		<div className="space-y-6">
			<BackLink label="Staff Directory" onClick={onBack} />
			{error ? (
				<ErrorBox message={error} />
			) : !data ? (
				<div className="p-6 text-gray-500">Loading…</div>
			) : (
				<>
					<div>
						<h2 className="text-xl font-semibold text-gray-900">{data.home.name}</h2>
						<p className="text-sm text-gray-600">
							{[data.home.address, data.home.phone].filter(Boolean).join(' · ')}
						</p>
					</div>

					<section className="rounded-lg border border-gray-200 bg-white">
						<div className="border-b border-gray-200 px-4 py-3">
							<h3 className="font-semibold text-gray-900">Staff roster</h3>
						</div>
						<div className="overflow-x-auto">
							<table className="min-w-full divide-y divide-gray-200 text-sm">
								<thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
									<tr>
										<th className="px-4 py-3">Name</th>
										<th className="px-4 py-3">Title</th>
										<th className="px-4 py-3">Date of hire</th>
										<th className="px-4 py-3">Status</th>
										{data.canEdit && <th className="px-4 py-3" />}
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-100">
									{data.roster.length === 0 ? (
										<tr>
											<td colSpan={5} className="px-4 py-8 text-center text-gray-500">
												Nobody is on this roster yet.
											</td>
										</tr>
									) : (
										data.roster.map((row) => (
											<tr key={row.entryId}>
												<td className="px-4 py-3">
													<button
														type="button"
														onClick={() => onOpenStaff(row.employeeId)}
														className="font-medium text-blue-600 hover:underline">
														{row.name}
													</button>
												</td>
												<td className="px-4 py-3 text-gray-700">{row.title || '—'}</td>
												<td className="whitespace-nowrap px-4 py-3 text-gray-700">
													{formatDate(row.rosterHireDate)}
												</td>
												<td className="px-4 py-3">
													<StatusBadge status={row.employmentStatus} />
												</td>
												{data.canEdit && (
													<td className="px-4 py-3 text-right">
														<button
															type="button"
															onClick={() => void removeFromRoster(row)}
															className="text-sm font-medium text-red-600 hover:underline">
															Remove
														</button>
													</td>
												)}
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
						{data.canEdit && (
							<AddToRosterForm home={data.home.name} addable={data.addable} onAdded={load} />
						)}
					</section>

					<section className="space-y-3">
						<h3 className="font-semibold text-gray-900">Home compliance documents</h3>
						<StaffDocumentsWorkspace location={data.home.name} />
					</section>
				</>
			)}
		</div>
	);
}

function AddToRosterForm({
	home,
	addable,
	onAdded,
}: {
	home: string;
	addable: {id: string; name: string}[];
	onAdded: () => void;
}) {
	const [employeeId, setEmployeeId] = useState('');
	const [title, setTitle] = useState('');
	const [rosterHireDate, setRosterHireDate] = useState('');
	const [saving, setSaving] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		try {
			await readJson(
				await fetch('/api/staff-directory/roster', {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({location: home, employeeId, title, rosterHireDate}),
				})
			);
			toast.success('Added to the roster');
			setEmployeeId('');
			setTitle('');
			setRosterHireDate('');
			onAdded();
		} catch (e: any) {
			toast.error(e.message);
		} finally {
			setSaving(false);
		}
	}

	return (
		<form onSubmit={submit} className="flex flex-wrap items-end gap-3 border-t border-gray-200 p-4">
			<label className="text-sm">
				<span className="mb-1 block font-medium text-gray-700">Add staff</span>
				<select
					value={employeeId}
					onChange={(e) => setEmployeeId(e.target.value)}
					required
					className="rounded-md border border-gray-300 px-3 py-2">
					<option value="">Choose an employee</option>
					{addable.map((employee) => (
						<option key={employee.id} value={employee.id}>
							{employee.name}
						</option>
					))}
				</select>
			</label>
			<label className="text-sm">
				<span className="mb-1 block font-medium text-gray-700">Title</span>
				<input
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="e.g. Staff, Live-in Staff"
					className="rounded-md border border-gray-300 px-3 py-2"
				/>
			</label>
			<label className="text-sm">
				<span className="mb-1 block font-medium text-gray-700">Date of hire (this home)</span>
				<input
					type="date"
					value={rosterHireDate}
					onChange={(e) => setRosterHireDate(e.target.value)}
					className="rounded-md border border-gray-300 px-3 py-2"
				/>
			</label>
			<button
				type="submit"
				disabled={saving || !employeeId}
				className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
				{saving ? 'Adding…' : 'Add to roster'}
			</button>
		</form>
	);
}

// ── Level 3: one staff member ──────────────────────────────────────────────

function StaffView({
	employeeId,
	backLabel,
	onBack,
}: {
	employeeId: string;
	backLabel: string;
	onBack: () => void;
}) {
	const [profile, setProfile] = useState<StaffProfile | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [editing, setEditing] = useState(false);

	const load = useCallback(() => {
		fetch(`/api/staff-directory/staff/${employeeId}`)
			.then(readJson)
			.then((body) => {
				setProfile(body);
				setError(null);
			})
			.catch((e) => setError(e.message));
	}, [employeeId]);

	useEffect(() => {
		load();
	}, [load]);

	return (
		<div className="space-y-6">
			<BackLink label={backLabel} onClick={onBack} />
			{error ? (
				<ErrorBox message={error} />
			) : !profile ? (
				<div className="p-6 text-gray-500">Loading…</div>
			) : (
				<>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 className="text-xl font-semibold text-gray-900">{profile.name}</h2>
							<p className="text-sm text-gray-600">
								{profile.homes.length > 0
									? profile.homes
											.map((home) => `${home.location}${home.title ? ` — ${home.title}` : ''}`)
											.join(' · ')
									: 'Not on any roster'}
							</p>
						</div>
						{profile.canEdit && !editing && (
							<button
								type="button"
								onClick={() => setEditing(true)}
								className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
								Edit profile
							</button>
						)}
					</div>

					{editing ? (
						<ProfileForm
							profile={profile}
							onCancel={() => setEditing(false)}
							onSaved={() => {
								setEditing(false);
								load();
							}}
						/>
					) : (
						<ProfileCard profile={profile} />
					)}

					<section className="space-y-3">
						<h3 className="font-semibold text-gray-900">Documents</h3>
						<StaffDocumentsWorkspace employeeId={profile.id} />
					</section>
				</>
			)}
		</div>
	);
}

function ProfileCard({profile}: {profile: StaffProfile}) {
	const sexLabel =
		profile.sex && profile.sex in STAFF_SEX_LABELS
			? STAFF_SEX_LABELS[profile.sex as keyof typeof STAFF_SEX_LABELS]
			: '—';
	const emergency = [
		profile.emergencyContactName,
		profile.emergencyContactRelationship && `(${profile.emergencyContactRelationship})`,
		profile.emergencyContactPhone,
	]
		.filter(Boolean)
		.join(' ');

	const fields: [string, React.ReactNode][] = [
		['Name', profile.name],
		['Email', profile.email || profile.workEmail || '—'],
		['Phone', profile.phone || '—'],
		['Date of birth', formatDate(profile.dateOfBirth)],
		['Sex', sexLabel],
		['Home address', profile.homeAddress || '—'],
		['Date of hire', formatDate(profile.dateOfHire)],
		['Status', <StatusBadge key="status" status={profile.employmentStatus} />],
		['Emergency contact', emergency || '—'],
	];

	return (
		<section className="rounded-lg border border-gray-200 bg-white p-4">
			<dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
				{fields.map(([label, value]) => (
					<div key={label}>
						<dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
						<dd className="mt-1 text-sm text-gray-900">{value}</dd>
					</div>
				))}
				<div className="sm:col-span-2">
					<dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Notes</dt>
					<dd className="mt-1 whitespace-pre-wrap text-sm text-gray-900">
						{profile.profileNotes || '—'}
					</dd>
				</div>
			</dl>
		</section>
	);
}

function ProfileForm({
	profile,
	onCancel,
	onSaved,
}: {
	profile: StaffProfile;
	onCancel: () => void;
	onSaved: () => void;
}) {
	const [initial] = useState(() => ({
		phone: profile.phone ?? '',
		dateOfBirth: profile.dateOfBirth ?? '',
		sex: profile.sex ?? '',
		homeAddress: profile.homeAddress ?? '',
		dateOfHire: profile.dateOfHire ?? '',
		employmentStatus: profile.employmentStatus === 'inactive' ? 'inactive' : 'active',
		emergencyContactName: profile.emergencyContactName ?? '',
		emergencyContactPhone: profile.emergencyContactPhone ?? '',
		emergencyContactRelationship: profile.emergencyContactRelationship ?? '',
		profileNotes: profile.profileNotes ?? '',
	}));
	const [form, setForm] = useState(initial);
	const [saving, setSaving] = useState(false);
	const set = (key: keyof typeof form) => (
		e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
	) => setForm({...form, [key]: e.target.value});

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		// Only send what changed: saving a phone number must not, say, flip a
		// 'pending' invite to Active because the select shows Active.
		const changed = Object.fromEntries(
			Object.entries(form).filter(([key, value]) => initial[key as keyof typeof initial] !== value)
		);
		if (Object.keys(changed).length === 0) {
			onCancel();
			return;
		}
		setSaving(true);
		try {
			await readJson(
				await fetch(`/api/staff-directory/staff/${profile.id}`, {
					method: 'PATCH',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify(changed),
				})
			);
			toast.success('Profile saved');
			onSaved();
		} catch (e: any) {
			toast.error(e.message);
		} finally {
			setSaving(false);
		}
	}

	const input = 'w-full rounded-md border border-gray-300 px-3 py-2';
	const label = 'mb-1 block font-medium text-gray-700';

	return (
		<form onSubmit={submit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
			<p className="text-sm text-gray-600">
				Name and email are changed in People, because they&apos;re tied to the login.
			</p>
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="block text-sm">
					<span className={label}>Phone</span>
					<input value={form.phone} onChange={set('phone')} className={input} />
				</label>
				<label className="block text-sm">
					<span className={label}>Date of birth</span>
					<input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} className={input} />
				</label>
				<label className="block text-sm">
					<span className={label}>Sex</span>
					<select value={form.sex} onChange={set('sex')} className={input}>
						<option value="">—</option>
						{STAFF_SEX_OPTIONS.map((option) => (
							<option key={option} value={option}>
								{STAFF_SEX_LABELS[option]}
							</option>
						))}
					</select>
				</label>
				<label className="block text-sm">
					<span className={label}>Date of hire</span>
					<input type="date" value={form.dateOfHire} onChange={set('dateOfHire')} className={input} />
				</label>
				<label className="block text-sm sm:col-span-2">
					<span className={label}>Home address</span>
					<input value={form.homeAddress} onChange={set('homeAddress')} className={input} />
				</label>
				<label className="block text-sm">
					<span className={label}>Status</span>
					<select value={form.employmentStatus} onChange={set('employmentStatus')} className={input}>
						<option value="active">Active</option>
						<option value="inactive">Inactive</option>
					</select>
					<span className="mt-1 block text-xs text-gray-500">
						Inactive is a record only — it doesn&apos;t sign them out. Remove app access in People.
					</span>
				</label>
				<div />
				<label className="block text-sm">
					<span className={label}>Emergency contact name</span>
					<input value={form.emergencyContactName} onChange={set('emergencyContactName')} className={input} />
				</label>
				<label className="block text-sm">
					<span className={label}>Emergency contact phone</span>
					<input value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} className={input} />
				</label>
				<label className="block text-sm">
					<span className={label}>Relationship</span>
					<input
						value={form.emergencyContactRelationship}
						onChange={set('emergencyContactRelationship')}
						placeholder="e.g. Spouse, Sister"
						className={input}
					/>
				</label>
				<div />
				<label className="block text-sm sm:col-span-2">
					<span className={label}>Notes</span>
					<textarea value={form.profileNotes} onChange={set('profileNotes')} rows={3} className={input} />
				</label>
			</div>
			<div className="flex gap-3">
				<button
					type="submit"
					disabled={saving}
					className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
					{saving ? 'Saving…' : 'Save profile'}
				</button>
				<button
					type="button"
					onClick={onCancel}
					className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
					Cancel
				</button>
			</div>
		</form>
	);
}
