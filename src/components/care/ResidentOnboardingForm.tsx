import React, {useState, useEffect} from 'react';

const COMM_CHANNELS = [
	{value: 'email', label: 'Email'},
	{value: 'phone', label: 'Phone'},
	{value: 'sms', label: 'SMS'},
	{value: 'mail', label: 'Mail'},
];

export default function ResidentOnboardingForm({ onCreated }: { onCreated?: (residentId: string) => void }) {
	const [form, setForm] = useState({
		legalName: '',
		dob: '',
		location: '',
		guardians: [{name: '', email: '', phone: '', preferredChannel: 'email'}],
		generateChecklist: false,
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState(null);
	const [availableLocations, setAvailableLocations] = useState([]);
	const [loadingLocations, setLoadingLocations] = useState(true);

	useEffect(() => {
		async function fetchLocations() {
			setLoadingLocations(true);
			try {
				const res = await fetch('/api/admin/employees/available-locations');
				if (!res.ok) throw new Error('Failed to fetch locations');
				const data = await res.json();
				setAvailableLocations(data);
			} catch (e) {
				console.error('Error fetching locations:', e);
				setError(e.message || 'Failed to load locations.');
			} finally {
				setLoadingLocations(false);
			}
		}
		fetchLocations();
	}, []);

	const handleGuardianChange = (idx, field, value) => {
		setForm((prev) => {
			const guardians = [...prev.guardians];
			guardians[idx] = {...guardians[idx], [field]: value};
			return {...prev, guardians};
		});
	};

	const addGuardian = () => {
		setForm((prev) => ({
			...prev,
			guardians: [
				...prev.guardians,
				{name: '', email: '', phone: '', preferredChannel: 'email'},
			],
		}));
	};

	const removeGuardian = (idx) => {
		setForm((prev) => ({
			...prev,
			guardians: prev.guardians.filter((_, i) => i !== idx),
		}));
	};

	const handleSubmit = async () => {
		setError(null);

		if (!form.legalName.trim() || !form.dob.trim() || !form.location.trim()) {
			setError('All required fields must be filled.');
			return;
		}
		setIsSubmitting(true);
		try {
			const res = await fetch('/api/people', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					name: form.legalName.trim(),
					dateOfBirth: form.dob.trim(),
					location: form.location,
					guardians: form.guardians,
					generateChecklist: form.generateChecklist,
				}),
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to create resident');
			}

			const result = await res.json();
			alert('Resident created successfully!');
			setForm({
				legalName: '',
				dob: '',
				location: '',
				guardians: [
					{name: '', email: '', phone: '', preferredChannel: 'email'},
				],
				generateChecklist: false,
			});
			if (onCreated && result && result.id) onCreated(result.id);
		} catch (err) {
			setError(err.message);
			alert(err.message);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
			<h3 className="text-lg font-semibold mb-4">Add New Resident</h3>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">
						Legal Name *
					</label>
					<input
						type="text"
						value={form.legalName}
						onChange={(e) =>
							setForm((f) => ({...f, legalName: e.target.value}))
						}
						className="w-full border border-gray-300 rounded-md px-3 py-2"
						required
						disabled={isSubmitting}
					/>
				</div>
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">
						Date of Birth *
					</label>
					<input
						type="date"
						value={form.dob}
						onChange={(e) => setForm((f) => ({...f, dob: e.target.value}))}
						className="w-full border border-gray-300 rounded-md px-3 py-2"
						required
						disabled={isSubmitting}
					/>
				</div>
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">
						Primary Location *
					</label>
					<select
						value={form.location}
						onChange={(e) => setForm((f) => ({...f, location: e.target.value}))}
						className="w-full border border-gray-300 rounded-md px-3 py-2"
						required
						disabled={isSubmitting}>
						<option value="">Select location</option>
						{availableLocations.map((loc) => (
							<option key={loc} value={loc}>
								{loc}
							</option>
						))}
					</select>
				</div>
			</div>
			<div>
				<label className="block text-sm font-medium text-gray-700 mb-2">
					Guardian Contacts (optional)
				</label>
				{form.guardians.map((g, idx) => (
					<div key={idx} className="flex flex-col md:flex-row gap-2 mb-2">
						<input
							type="text"
							placeholder="Name"
							value={g.name}
							onChange={(e) =>
								handleGuardianChange(idx, 'name', e.target.value)
							}
							className="border border-gray-300 rounded-md px-3 py-2 flex-1"
							required
							disabled={isSubmitting}
							aria-label={`Guardian ${idx + 1} Name`}
						/>
						<input
							type="email"
							placeholder="Email"
							value={g.email}
							onChange={(e) =>
								handleGuardianChange(idx, 'email', e.target.value)
							}
							className="border border-gray-300 rounded-md px-3 py-2 flex-1"
							required
							disabled={isSubmitting}
							aria-label={`Guardian ${idx + 1} Email`}
						/>
						<input
							type="tel"
							placeholder="Phone"
							value={g.phone}
							onChange={(e) =>
								handleGuardianChange(idx, 'phone', e.target.value)
							}
							className="border border-gray-300 rounded-md px-3 py-2 flex-1"
							required
							disabled={isSubmitting}
							aria-label={`Guardian ${idx + 1} Phone`}
						/>
						<select
							value={g.preferredChannel}
							onChange={(e) =>
								handleGuardianChange(idx, 'preferredChannel', e.target.value)
							}
							className="border border-gray-300 rounded-md px-3 py-2 flex-1"
							required
							disabled={isSubmitting}
							aria-label={`Guardian ${idx + 1} Preferred Communication Channel`}>
							{COMM_CHANNELS.map((ch) => (
								<option key={ch.value} value={ch.value}>
									{ch.label}
								</option>
							))}
						</select>
						{form.guardians.length > 1 && (
							<button
								type="button"
								onClick={() => removeGuardian(idx)}
								className="text-red-600"
								disabled={isSubmitting}>
								Remove
							</button>
						)}
					</div>
				))}
				<button
					type="button"
					onClick={addGuardian}
					className="text-blue-600 mt-2"
					disabled={isSubmitting}>
					+ Add Guardian
				</button>
			</div>
			<div className="flex items-center space-x-3">
				<input
					id="generateChecklist"
					type="checkbox"
					checked={form.generateChecklist}
					onChange={(e) =>
						setForm((f) => ({...f, generateChecklist: e.target.checked}))
					}
					disabled={isSubmitting}
				/>
				<label
					htmlFor="generateChecklist"
					className="text-sm font-medium text-gray-700">
					Generate Guardian Checklist link after creation
				</label>
			</div>
			{error && (
				<div className="bg-red-50 border border-red-200 rounded-md p-4">
					<div className="text-red-700 text-sm">{error}</div>
				</div>
			)}
			<div className="flex justify-end">
				<button
					onClick={handleSubmit}
					className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
					disabled={isSubmitting}>
					{isSubmitting ? 'Creating...' : 'Create Resident'}
				</button>
			</div>
		</div>
	);
}
