'use client';

import React, {useCallback, useEffect, useState} from 'react';
import {toast} from 'sonner';

interface PrivilegeOption {
	key: string;
	label: string;
}

interface PrivilegeUser {
	id: string;
	clerkUserId: string | null;
	name: string;
	email?: string | null;
	workEmail?: string | null;
	role?: string | null;
	locations?: string[];
	employmentStatus?: string | null;
	privileges: string[];
}

export default function AdminPrivilegesWorkspace() {
	const [privileges, setPrivileges] = useState<PrivilegeOption[]>([]);
	const [users, setUsers] = useState<PrivilegeUser[]>([]);
	const [loading, setLoading] = useState(true);
	const [savingUserId, setSavingUserId] = useState<string | null>(null);

	const fetchPrivileges = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch('/api/admin/privileges');
			if (!res.ok) {
				const error = await res.json().catch(() => ({}));
				throw new Error(error.error || 'Failed to load privileges');
			}

			const data = await res.json();
			setPrivileges(data.privileges || []);
			setUsers(data.users || []);
		} catch (error: any) {
			console.error('Error loading admin privileges:', error);
			toast.error(error.message || 'Failed to load admin privileges');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void fetchPrivileges();
	}, [fetchPrivileges]);

	async function updateUserPrivileges(user: PrivilegeUser, nextPrivileges: string[]) {
		if (!user.clerkUserId) {
			toast.error('This employee has not linked a user account yet');
			return;
		}

		setSavingUserId(user.clerkUserId);
		try {
			const res = await fetch(
				`/api/admin/privileges/${encodeURIComponent(user.clerkUserId)}`,
				{
					method: 'PUT',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({privileges: nextPrivileges}),
				}
			);

			if (!res.ok) {
				const error = await res.json().catch(() => ({}));
				throw new Error(error.error || 'Failed to update privileges');
			}

			setUsers((currentUsers) =>
				currentUsers.map((currentUser) =>
					currentUser.clerkUserId === user.clerkUserId
						? {...currentUser, privileges: nextPrivileges}
						: currentUser
				)
			);
			toast.success('Privileges updated');
		} catch (error: any) {
			console.error('Error updating privileges:', error);
			toast.error(error.message || 'Failed to update privileges');
		} finally {
			setSavingUserId(null);
		}
	}

	if (loading) {
		return (
			<div className="rounded-lg bg-white p-8 text-center shadow">
				<div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
				<p className="text-gray-600">Loading privileges...</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-2xl font-bold text-gray-900">
					Delegated Admin Privileges
				</h2>
				<p className="mt-1 text-sm text-gray-600">
					Give staff and supervisors access to specific management tools without
					making them full admins.
				</p>
			</div>

			<div className="overflow-hidden rounded-lg bg-white shadow">
				<div className="divide-y divide-gray-200">
					{users.length === 0 ? (
						<div className="p-8 text-center text-gray-500">
							No linked staff or supervisors found.
						</div>
					) : (
						users.map((user) => {
							const saving = savingUserId === user.clerkUserId;
							return (
								<div key={user.id} className="p-5">
									<div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
										<div>
											<h3 className="font-semibold text-gray-900">
												{user.name || user.workEmail || user.email || 'Unnamed User'}
											</h3>
											<p className="text-sm text-gray-600">
												{user.workEmail || user.email || 'No email'}
											</p>
											<div className="mt-2 flex flex-wrap gap-2 text-xs">
												<span className="rounded bg-slate-100 px-2 py-1 font-medium text-slate-700">
													{user.role || 'No role'}
												</span>
												{(user.locations || []).map((location) => (
													<span
														key={location}
														className="rounded bg-blue-50 px-2 py-1 text-blue-700">
														{location}
													</span>
												))}
											</div>
										</div>
										{saving && (
											<span className="text-sm font-medium text-blue-600">
												Saving...
											</span>
										)}
									</div>

									<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
										{privileges.map((privilege) => {
											const checked = user.privileges.includes(privilege.key);
											return (
												<label
													key={privilege.key}
													className="flex min-h-11 items-center gap-3 rounded border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
													<input
														type="checkbox"
														checked={checked}
														disabled={saving || !user.clerkUserId}
														onChange={(event) => {
															const nextPrivileges = event.target.checked
																? [...user.privileges, privilege.key]
																: user.privileges.filter(
																		(item) => item !== privilege.key
																	);
															void updateUserPrivileges(user, nextPrivileges);
														}}
														className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
													/>
													<span className="text-gray-800">{privilege.label}</span>
												</label>
											);
										})}
									</div>
								</div>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
}
