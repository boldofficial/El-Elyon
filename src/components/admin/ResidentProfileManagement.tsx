// src/components/admin/ResidentProfileManagement.tsx

'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';
import ResidentActivityHistory from '../care/ResidentActivityHistory';
import {inactiveDateLabel} from '@/lib/resident-status';

interface Resident {
	id: string;
	name: string;
	status?: 'active' | 'inactive';
	inactiveReason?: 'deceased' | 'placement_terminated' | 'discharged' | null;
	inactiveDate?: string | null;
	dateOfBirth?: string;
	phone?: string;
	placementDate?: Date;
	sex?: string;
	weight?: string;
	height?: string;
	hairColor?: string;
	diagnosis?: string;
	allergies?: string;
	supportBroker?: string;
	importantRelationships?: string;
	fundingAgency?: string;
	caseManagerName?: string;
	caseManagerPhone?: string;
	caseManagerEmail?: string;
	vocationalAgency?: string;
	vocationalAgencyAddress?: string;
	location?: string;
	guardianIds?: string[];
	emergencyContact?: string;
	carbTrackingEnabled?: boolean;
}

interface RelationshipContact {
	name: string;
	relationship: string;
	phone: string;
	email: string;
	address: string;
}

// Mirrors the <option> labels on the Inactive Reason select below, so the
// deactivation confirmation names the reason the way the admin just picked it.
const INACTIVE_REASON_LABELS: Record<string, string> = {
	deceased: 'Deceased',
	placement_terminated: 'Placement Terminated',
	discharged: 'Discharged',
};

const emptyRelationshipContact = (): RelationshipContact => ({
	name: '',
	relationship: '',
	phone: '',
	email: '',
	address: '',
});

function parseRelationshipContacts(value?: string): RelationshipContact[] {
	if (!value?.trim()) return [emptyRelationshipContact()];

	try {
		const parsed = JSON.parse(value);
		const contacts = Array.isArray(parsed) ? parsed : parsed?.contacts;
		if (Array.isArray(contacts) && contacts.length > 0) {
			return contacts.map((contact: any) => ({
				name: contact?.name || '',
				relationship: contact?.relationship || '',
				phone: contact?.phone || '',
				email: contact?.email || '',
				address: contact?.address || '',
			}));
		}
	} catch (_error) {
		// Existing records may be plain text from the old field.
	}

	return [{...emptyRelationshipContact(), name: value}];
}

function serializeRelationshipContacts(contacts: RelationshipContact[]) {
	const cleaned = contacts
		.map((contact) => ({
			name: contact.name.trim(),
			relationship: contact.relationship.trim(),
			phone: contact.phone.trim(),
			email: contact.email.trim(),
			address: contact.address.trim(),
		}))
		.filter((contact) =>
			Object.values(contact).some((value) => value.length > 0)
		);

	return cleaned.length > 0 ? JSON.stringify(cleaned) : '';
}

export default function ResidentProfileManagement({
	residentId,
}: {
	residentId: string;
}) {
	const [resident, setResident] = useState<Resident | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [activeTab, setActiveTab] = useState<'profile' | 'logs'>('profile');
	const [relationshipContacts, setRelationshipContacts] = useState<
		RelationshipContact[]
	>([emptyRelationshipContact()]);
	// The status as it stands ON THE SERVER, not in the form. The confirmation
	// below must fire on the active -> inactive transition, so comparing against
	// the edited form state would be circular.
	const [savedStatus, setSavedStatus] = useState<Resident['status']>('active');

	useEffect(() => {
		async function fetchResident() {
			try {
				const res = await fetch(`/api/admin/residents/${residentId}/profile`);
				if (!res.ok) throw new Error('Failed to fetch');

				const data = await res.json();
				setResident(data);
				setSavedStatus(data.status === 'inactive' ? 'inactive' : 'active');
				setRelationshipContacts(
					parseRelationshipContacts(data.importantRelationships)
				);
			} catch (error) {
				console.error('Error fetching resident:', error);
				toast.error('Failed to load resident data');
			} finally {
				setLoading(false);
			}
		}

		fetchResident();
	}, [residentId]);

	const handleChange = (
		e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
	) => {
		const {name, value} = e.target;
		setResident((prev) => {
			if (!prev) return null;
			if (name === 'status') {
				return {
					...prev,
					status: value as Resident['status'],
					inactiveReason: value === 'inactive' ? prev.inactiveReason : null,
					inactiveDate: value === 'inactive' ? prev.inactiveDate : null,
				};
			}
			return {...prev, [name]: value};
		});
	};

	/**
	 * Counts the guardian checklists that saving would revoke, so the
	 * confirmation can name a real number instead of a vague warning.
	 *
	 * Best-effort on purpose: if the count cannot be fetched we still confirm,
	 * just without the number. Failing to load a nicety must never be the reason
	 * an admin cannot close out a resident who has left.
	 */
	const countRevocableChecklists = async (): Promise<number | null> => {
		try {
			const res = await fetch(
				`/api/guardian-checklists/links?residentId=${residentId}&pendingOnly=true`
			);
			if (!res.ok) return null;
			const links = await res.json();
			if (!Array.isArray(links)) return null;
			// Already-expired links are not revoked by saving -- they are spent.
			return links.filter((l: {expired?: boolean}) => !l.expired).length;
		} catch {
			return null;
		}
	};

	/**
	 * Confirms the one change on this form that cannot be cleanly undone.
	 *
	 * Deliberately at SAVE time rather than on the dropdown's change event.
	 * Changing the dropdown commits nothing -- an admin can flip it, think
	 * better of it and navigate away -- so confirming there would ask a heavy
	 * question for an action that may never happen, and ask it again on every
	 * toggle. This is the moment the alerts actually stop.
	 *
	 * Returns false only when the admin explicitly declines.
	 */
	const confirmDeactivation = async (target: Resident): Promise<boolean> => {
		const revocable = await countRevocableChecklists();
		const reason = target.inactiveReason
			? INACTIVE_REASON_LABELS[target.inactiveReason] ?? target.inactiveReason
			: null;

		const lines = [
			`Mark ${target.name} as inactive${reason ? ` (${reason})` : ''}?`,
			'',
			'This will:',
			'  - Stop all compliance alerts and reminders about them',
			'  - Remove them from care portal resident lists',
			'  - Make their record read-only (no new care logs)',
		];

		if (revocable === null) {
			lines.push('  - Revoke any pending guardian checklists');
		} else if (revocable > 0) {
			lines.push(
				`  - Revoke ${revocable} pending guardian checklist${revocable === 1 ? '' : 's'}`
			);
		}

		lines.push(
			'',
			'Their records, logs and documents are kept and stay readable.',
			'Reversing this does not restore revoked checklists -- they must be re-sent.'
		);

		return window.confirm(lines.join('\n'));
	};

	const handleSave = async () => {
		if (!resident) return;

		// Only the active -> inactive transition is confirmed. Editing an
		// unrelated field on someone already inactive changes nothing about their
		// alerts, and should not nag.
		const isDeactivating =
			savedStatus !== 'inactive' && resident.status === 'inactive';
		if (isDeactivating && !(await confirmDeactivation(resident))) return;

		const importantRelationships =
			serializeRelationshipContacts(relationshipContacts);

		setSaving(true);
		try {
			const res = await fetch(`/api/admin/residents/${residentId}/profile`, {
				method: 'PATCH',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({...resident, importantRelationships}),
			});

			if (!res.ok) throw new Error('Failed to update');

			const updated = await res.json();
			setResident(updated);
			setSavedStatus(updated.status === 'inactive' ? 'inactive' : 'active');
			setRelationshipContacts(
				parseRelationshipContacts(updated.importantRelationships)
			);
			toast.success('Resident profile updated successfully');
		} catch (error) {
			console.error('Error updating resident:', error);
			toast.error('Failed to update resident profile');
		} finally {
			setSaving(false);
		}
	};

	const updateRelationshipContact = (
		index: number,
		field: keyof RelationshipContact,
		value: string
	) => {
		setRelationshipContacts((prev) =>
			prev.map((contact, contactIndex) =>
				contactIndex === index ? {...contact, [field]: value} : contact
			)
		);
	};

	const addRelationshipContact = () => {
		setRelationshipContacts((prev) => [...prev, emptyRelationshipContact()]);
	};

	const removeRelationshipContact = (index: number) => {
		setRelationshipContacts((prev) => {
			const next = prev.filter((_, contactIndex) => contactIndex !== index);
			return next.length > 0 ? next : [emptyRelationshipContact()];
		});
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
		);
	}

	if (!resident) {
		return <div>Resident not found</div>;
	}

	return (
		<div className="space-y-6">
			{/* Tab Navigation */}
			<div className="border-b border-gray-200">
				<nav className="-mb-px flex space-x-8">
					<button
						onClick={() => setActiveTab('profile')}
						className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
							activeTab === 'profile'
								? 'border-blue-500 text-blue-600'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
						}`}>
						Profile
					</button>
					<button
						onClick={() => setActiveTab('logs')}
						className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
							activeTab === 'logs'
								? 'border-blue-500 text-blue-600'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
						}`}>
						Log History
					</button>
				</nav>
			</div>

			{/* Tab Content */}
			{activeTab === 'logs' ? (
				<div className="space-y-4">
					<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
						<h3 className="text-lg font-semibold text-blue-900 mb-2">📝 Log History</h3>
						<p className="text-sm text-blue-800">View all logs for {resident.name}</p>
					</div>
					<ResidentActivityHistory residentId={residentId} />
				</div>
			) : (
				<>
					{/* Personal Information */}
			<div className="bg-white rounded-lg shadow p-6">
				<h2 className="text-xl font-bold mb-4">Personal Information</h2>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className="block text-sm font-medium mb-1">Name</label>
						<input
							type="text"
							name="name"
							value={resident.name}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">
							Date of Birth
						</label>
						<input
							type="date"
							name="dateOfBirth"
							value={resident.dateOfBirth || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">Phone</label>
						<input
							type="tel"
							name="phone"
							value={resident.phone || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">Status</label>
						<select
							id="status"
							title="Status"
							name="status"
							value={resident.status || 'active'}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2">
							<option value="active">Active</option>
							<option value="inactive">Inactive</option>
						</select>
					</div>
					{(resident.status || 'active') === 'inactive' && (
						<div>
							<label className="block text-sm font-medium mb-1">
								Inactive Reason
							</label>
							<select
								id="inactiveReason"
								title="Inactive Reason"
								name="inactiveReason"
								value={resident.inactiveReason || ''}
								onChange={handleChange}
								className="w-full border rounded px-3 py-2">
								<option value="">Select...</option>
								<option value="deceased">Deceased</option>
								<option value="placement_terminated">
									Placement Terminated
								</option>
								<option value="discharged">Discharged</option>
							</select>
						</div>
					)}
					{(resident.status || 'active') === 'inactive' && (
						<div>
							<label
								htmlFor="inactiveDate"
								className="block text-sm font-medium mb-1">
								{inactiveDateLabel(resident.inactiveReason)}
							</label>
							<input
								id="inactiveDate"
								type="date"
								name="inactiveDate"
								value={resident.inactiveDate || ''}
								onChange={handleChange}
								className="w-full border rounded px-3 py-2"
							/>
						</div>
					)}
					<div>
						<label className="block text-sm font-medium mb-1">
							Placement Date
						</label>
						<input
							type="date"
							name="placementDate"
							value={
								resident.placementDate
									? new Date(resident.placementDate).toISOString().split('T')[0]
									: ''
							}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">Sex</label>
						<select
              id="sex"
              title="Sex"
							name="sex"
							value={resident.sex || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2">
							<option value="">Select...</option>
							<option value="Male">Male</option>
							<option value="Female">Female</option>
							<option value="Other">Other</option>
						</select>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">Weight</label>
						<input
							type="text"
							name="weight"
							value={resident.weight || ''}
							onChange={handleChange}
							placeholder="e.g., 150 lbs"
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">Height</label>
						<input
							type="text"
							name="height"
							value={resident.height || ''}
							onChange={handleChange}
							placeholder="e.g., 5'8&quot;"
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">Hair Color</label>
						<input
							type="text"
							name="hairColor"
							value={resident.hairColor || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
				</div>

				<div className="mt-4">
					<label className="block text-sm font-medium mb-1">Diagnosis</label>
					<textarea
						name="diagnosis"
						value={resident.diagnosis || ''}
						onChange={handleChange}
						rows={3}
						className="w-full border rounded px-3 py-2"
					/>
				</div>

				<div className="mt-4">
					<label className="block text-sm font-medium mb-1">Allergies</label>
					<textarea
						name="allergies"
						value={resident.allergies || ''}
						onChange={handleChange}
						rows={2}
						placeholder="Food, medication, environmental... or leave blank if none known"
						className="w-full border rounded px-3 py-2"
					/>
				</div>
			</div>

			{/* Funding & Case Management */}
			<div className="bg-white rounded-lg shadow p-6">
				<h2 className="text-xl font-bold mb-4">Funding & Case Management</h2>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className="block text-sm font-medium mb-1">
							Funding Agency
						</label>
						<input
							type="text"
							name="fundingAgency"
							value={resident.fundingAgency || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">
							Support Broker
						</label>
						<input
							type="text"
							name="supportBroker"
							value={resident.supportBroker || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">
							Case Manager Name
						</label>
						<input
							type="text"
							name="caseManagerName"
							value={resident.caseManagerName || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">
							Case Manager Phone
						</label>
						<input
							type="tel"
							name="caseManagerPhone"
							value={resident.caseManagerPhone || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div className="col-span-2">
						<label className="block text-sm font-medium mb-1">
							Case Manager Email
						</label>
						<input
							type="email"
							name="caseManagerEmail"
							value={resident.caseManagerEmail || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
				</div>
			</div>

			{/* Vocational Agency */}
			<div className="bg-white rounded-lg shadow p-6">
				<h2 className="text-xl font-bold mb-4">Vocational Agency</h2>
				<div className="space-y-4">
					<div>
						<label className="block text-sm font-medium mb-1">
							Agency Name
						</label>
						<input
							type="text"
							name="vocationalAgency"
							value={resident.vocationalAgency || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">
							Agency Address
						</label>
						<textarea
							name="vocationalAgencyAddress"
							value={resident.vocationalAgencyAddress || ''}
							onChange={handleChange}
							rows={3}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
				</div>
			</div>

			{/* Important Relationships */}
			<div className="bg-white rounded-lg shadow p-6">
				<h2 className="text-xl font-bold mb-4">Important Relationships</h2>
				<div className="space-y-4">
					{relationshipContacts.map((contact, index) => (
						<div key={index} className="border rounded-lg p-4 space-y-4">
							<div className="flex items-center justify-between gap-3">
								<h3 className="font-medium text-gray-900">
									Contact {index + 1}
								</h3>
								{relationshipContacts.length > 1 && (
									<button
										type="button"
										onClick={() => removeRelationshipContact(index)}
										className="text-sm text-red-600 hover:text-red-800">
										Remove
									</button>
								)}
							</div>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label className="block text-sm font-medium mb-1">Name</label>
									<input
										type="text"
										value={contact.name}
										onChange={(event) =>
											updateRelationshipContact(
												index,
												'name',
												event.target.value
											)
										}
										className="w-full border rounded px-3 py-2"
										placeholder="Contact name"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium mb-1">
										Relationship
									</label>
									<input
										type="text"
										value={contact.relationship}
										onChange={(event) =>
											updateRelationshipContact(
												index,
												'relationship',
												event.target.value
											)
										}
										className="w-full border rounded px-3 py-2"
										placeholder="Guardian, sibling, friend..."
									/>
								</div>
								<div>
									<label className="block text-sm font-medium mb-1">
										Phone Number
									</label>
									<input
										type="tel"
										value={contact.phone}
										onChange={(event) =>
											updateRelationshipContact(
												index,
												'phone',
												event.target.value
											)
										}
										className="w-full border rounded px-3 py-2"
										placeholder="Phone number"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium mb-1">
										Email Address
									</label>
									<input
										type="email"
										value={contact.email}
										onChange={(event) =>
											updateRelationshipContact(
												index,
												'email',
												event.target.value
											)
										}
										className="w-full border rounded px-3 py-2"
										placeholder="Email address"
									/>
								</div>
								<div className="md:col-span-2">
									<label className="block text-sm font-medium mb-1">
										Address
									</label>
									<textarea
										value={contact.address}
										onChange={(event) =>
											updateRelationshipContact(
												index,
												'address',
												event.target.value
											)
										}
										rows={2}
										className="w-full border rounded px-3 py-2"
										placeholder="Mailing address"
									/>
								</div>
							</div>
						</div>
					))}
					<button
						type="button"
						onClick={addRelationshipContact}
						className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded border border-blue-600">
						+ Add Relationship Contact
					</button>
				</div>
			</div>

			{/* Emergency Contact */}
			<div className="bg-white rounded-lg shadow p-6">
				<h2 className="text-xl font-bold mb-4">Emergency Contact</h2>
				<textarea
					name="emergencyContact"
					value={resident.emergencyContact || ''}
					onChange={handleChange}
					rows={3}
					className="w-full border rounded px-3 py-2"
					placeholder="Emergency contact name, phone number, relationship, and any notes..."
				/>
			</div>

			{/* Care tracking */}
			<div className="bg-white rounded-lg shadow p-6">
				<h2 className="text-xl font-bold mb-4">Care Tracking</h2>
				<label className="flex items-start gap-3 cursor-pointer">
					<input
						type="checkbox"
						name="carbTrackingEnabled"
						checked={resident.carbTrackingEnabled ?? false}
						onChange={(e) =>
							setResident((prev) =>
								prev ? {...prev, carbTrackingEnabled: e.target.checked} : prev
							)
						}
						className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
					/>
					<span>
						<span className="block font-medium text-gray-900">
							Carb log (per meal)
						</span>
						<span className="block text-sm text-gray-600">
							Staff will see a Carb Log tab for this resident and be reminded on
							the dashboard when breakfast, lunch or dinner has not been logged.
						</span>
					</span>
				</label>
			</div>

			{/* Save Button */}
			<div className="flex justify-end">
				<button
					onClick={handleSave}
					disabled={saving}
					className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
					{saving ? 'Saving...' : 'Save Changes'}
				</button>
			</div>
				</>
			)}
		</div>
	);
}
