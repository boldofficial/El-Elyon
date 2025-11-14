import React from 'react';

interface AdminDeviceBadgeProps {
	deviceCheck: {
		isAdmin?: boolean;
		deviceName?: string;
		location?: string;
	};
}

/**
 * Shows a badge when admin is using an unrestricted device
 * Place this at the top of your admin portal or dashboard
 */
export default function AdminDeviceBadge({deviceCheck}: AdminDeviceBadgeProps) {
	if (!deviceCheck.isAdmin) {
		return null; // Only show for admin bypass
	}

	return (
		<div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center gap-3">
			<div className="text-2xl">🔓</div>
			<div className="flex-1">
				<p className="text-sm font-medium text-blue-900">
					Admin Access - Unrestricted Device
				</p>
				<p className="text-xs text-blue-700">
					You can access the system from any device. Staff members are
					restricted to registered kiosks only.
				</p>
			</div>
		</div>
	);
}
