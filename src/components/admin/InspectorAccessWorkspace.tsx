'use client';

// src/components/admin/InspectorAccessWorkspace.tsx
//
// Admin surface to grant state inspectors read-only, location-scoped access to
// the compliance dashboard via a one-time password. The OTP is shown exactly
// once at generation and cannot be retrieved later.

import React, {useEffect, useState} from 'react';
import {toast} from 'sonner';

interface Grant {
	id: string;
	location: string;
	label: string | null;
	expiresAt: string;
	createdAt: string;
	createdByName: string | null;
	revokedAt: string | null;
	lastAccessedAt: string | null;
	status: 'active' | 'expired' | 'revoked';
}

const EXPIRY_OPTIONS = [
	{label: '8 hours', hours: 8},
	{label: '24 hours', hours: 24},
	{label: '3 days', hours: 72},
	{label: '7 days', hours: 168},
];

const STATUS_STYLES: Record<string, string> = {
	active: 'bg-green-100 text-green-800',
	expired: 'bg-gray-100 text-gray-600',
	revoked: 'bg-red-100 text-red-700',
};

export default function InspectorAccessWorkspace() {
	const [locations, setLocations] = useState<{id: string; name: string}[]>([]);
	const [grants, setGrants] = useState<Grant[]>([]);
	const [loading, setLoading] = useState(true);

	const [location, setLocation] = useState('');
	const [label, setLabel] = useState('');
	const [expiresInHours, setExpiresInHours] = useState(24);
	const [generating, setGenerating] = useState(false);

	// The freshly generated OTP (shown once).
	const [newGrant, setNewGrant] = useState<{
		otp: string;
		location: string;
		expiresAt: string;
	} | null>(null);

	const inspectorUrl =
		typeof window !== 'undefined' ? `${window.location.origin}/inspector` : '/inspector';

	const load = async () => {
		try {
			const [locRes, grantRes] = await Promise.all([
				fetch('/api/admin/locations'),
				fetch('/api/admin/inspector-access'),
			]);
			if (locRes.ok) {
				const locs = await locRes.json();
				setLocations(locs);
				setLocation((cur) => cur || locs[0]?.name || '');
			}
			if (grantRes.ok) setGrants(await grantRes.json());
		} catch (error) {
			console.error('Error loading inspector access:', error);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleGenerate = async () => {
		if (!location) {
			toast.error('Select a location');
			return;
		}
		setGenerating(true);
		setNewGrant(null);
		try {
			const res = await fetch('/api/admin/inspector-access', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({location, label: label.trim(), expiresInHours}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to generate');
			setNewGrant({otp: data.otp, location: data.location, expiresAt: data.expiresAt});
			setLabel('');
			toast.success('Access code generated');
			load();
		} catch (error: any) {
			toast.error(error.message || 'Failed to generate access code');
		} finally {
			setGenerating(false);
		}
	};

	const handleRevoke = async (id: string) => {
		try {
			const res = await fetch(`/api/admin/inspector-access/${id}/revoke`, {
				method: 'POST',
			});
			if (!res.ok) throw new Error('Failed to revoke');
			toast.success('Access revoked');
			load();
		} catch (error: any) {
			toast.error(error.message || 'Failed to revoke');
		}
	};

	const copy = (text: string) => {
		navigator.clipboard?.writeText(text);
		toast.success('Copied');
	};

	return (
		<div className="space-y-6 max-w-4xl">
			<div>
				<h2 className="text-xl font-bold text-gray-900">State Inspector Access</h2>
				<p className="text-gray-600 text-sm mt-1">
					Generate a one-time access code that lets an inspector view a
					location's compliance records (read-only) without an account.
				</p>
			</div>

			{/* Generate */}
			<div className="bg-white rounded-lg border shadow-sm p-6 space-y-4">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Location
						</label>
						<select
							value={location}
							onChange={(e) => setLocation(e.target.value)}
							className="w-full border rounded px-3 py-2">
							{locations.map((l) => (
								<option key={l.id} value={l.name}>
									{l.name}
								</option>
							))}
						</select>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Label <span className="text-gray-400">(optional)</span>
						</label>
						<input
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							placeholder="e.g. State inspection – J. Smith"
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Valid for
						</label>
						<select
							value={expiresInHours}
							onChange={(e) => setExpiresInHours(Number(e.target.value))}
							className="w-full border rounded px-3 py-2">
							{EXPIRY_OPTIONS.map((o) => (
								<option key={o.hours} value={o.hours}>
									{o.label}
								</option>
							))}
						</select>
					</div>
				</div>
				<button
					onClick={handleGenerate}
					disabled={generating}
					className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
					{generating ? 'Generating...' : 'Generate Access Code'}
				</button>

				{newGrant && (
					<div className="mt-2 rounded-lg border-2 border-green-300 bg-green-50 p-4">
						<p className="text-sm text-green-900 font-medium mb-2">
							Access code for <strong>{newGrant.location}</strong> — copy it now,
							it won't be shown again.
						</p>
						<div className="flex items-center gap-3 flex-wrap">
							<code className="text-2xl font-mono font-bold tracking-widest bg-white px-4 py-2 rounded border">
								{newGrant.otp}
							</code>
							<button
								onClick={() => copy(newGrant.otp)}
								className="text-sm font-medium text-blue-700 hover:text-blue-900">
								Copy code
							</button>
							<button
								onClick={() => copy(inspectorUrl)}
								className="text-sm font-medium text-blue-700 hover:text-blue-900">
								Copy dashboard link
							</button>
						</div>
						<p className="text-xs text-green-800 mt-2">
							Inspector goes to <span className="font-mono">{inspectorUrl}</span>{' '}
							and enters this code. Expires{' '}
							{new Date(newGrant.expiresAt).toLocaleString()}.
						</p>
					</div>
				)}
			</div>

			{/* Existing grants */}
			<div className="bg-white rounded-lg border shadow-sm">
				<div className="px-6 py-3 border-b">
					<h3 className="font-semibold text-gray-900">Access codes</h3>
				</div>
				{loading ? (
					<div className="p-8 text-center text-gray-500">Loading...</div>
				) : grants.length === 0 ? (
					<div className="p-8 text-center text-gray-500">
						No inspector access codes yet.
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-left text-gray-500 border-b">
									<th className="px-6 py-2 font-medium">Location</th>
									<th className="px-4 py-2 font-medium">Label</th>
									<th className="px-4 py-2 font-medium">Status</th>
									<th className="px-4 py-2 font-medium">Expires</th>
									<th className="px-4 py-2 font-medium">Last used</th>
									<th className="px-4 py-2 font-medium"></th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{grants.map((g) => (
									<tr key={g.id}>
										<td className="px-6 py-3 font-medium text-gray-900">
											{g.location}
										</td>
										<td className="px-4 py-3 text-gray-600">{g.label || '—'}</td>
										<td className="px-4 py-3">
											<span
												className={`px-2 py-0.5 rounded-full text-xs font-medium ${
													STATUS_STYLES[g.status]
												}`}>
												{g.status}
											</span>
										</td>
										<td className="px-4 py-3 text-gray-600">
											{new Date(g.expiresAt).toLocaleString()}
										</td>
										<td className="px-4 py-3 text-gray-600">
											{g.lastAccessedAt
												? new Date(g.lastAccessedAt).toLocaleString()
												: 'Never'}
										</td>
										<td className="px-4 py-3 text-right">
											{g.status === 'active' && (
												<button
													onClick={() => handleRevoke(g.id)}
													className="text-red-600 hover:text-red-800 font-medium">
													Revoke
												</button>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}
