import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

export default function ComplianceAlerts() {
	const [alerts, setAlerts] = useState<any[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isFetching, setIsFetching] = useState(true);

	// Fetch active alerts
	const fetchAlerts = async () => {
		setIsFetching(true);
		try {
			const response = await fetch('/api/admin/compliance/active-alerts');
			if (!response.ok) throw new Error('Failed to fetch alerts');
			const data = await response.json();
			setAlerts(data);
		} catch (error: any) {
			console.error('Error fetching alerts:', error);
			toast.error(error.message || 'Failed to fetch alerts');
		} finally {
			setIsFetching(false);
		}
	};

	// Initial load
	useEffect(() => {
		fetchAlerts();
	}, []);

	// Dismiss alert
	const handleDismiss = async (alertId: string) => {
		setIsLoading(true);
		try {
			const response = await fetch('/api/admin/compliance/dismiss-alert', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({alertId}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to dismiss alert');
			}

			toast.success('Alert dismissed successfully');
			fetchAlerts(); // Refresh alerts list
		} catch (error: any) {
			console.error('Error dismissing alert:', error);
			toast.error(error.message || 'Failed to dismiss alert');
		} finally {
			setIsLoading(false);
		}
	};

	// Get severity color
	const getSeverityColor = (severity: string) => {
		switch (severity) {
			case 'high':
				return 'bg-red-100 text-red-800 border-red-200';
			case 'medium':
				return 'bg-yellow-100 text-yellow-800 border-yellow-200';
			case 'low':
				return 'bg-blue-100 text-blue-800 border-blue-200';
			default:
				return 'bg-gray-100 text-gray-800 border-gray-200';
		}
	};

	// Format date
	const formatDate = (date: Date | string) => new Date(date).toLocaleString();

	if (isFetching) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
				<span className="ml-2 text-gray-600">Loading alerts...</span>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="border-b border-gray-200 pb-4">
				<h3 className="text-lg font-semibold">Active Compliance Alerts</h3>
				<p className="text-sm text-gray-600 mt-1">
					Review and manage compliance alerts for your locations
				</p>
			</div>

			{/* Alerts List */}
			{alerts.length === 0 ? (
				<div className="text-center py-12 bg-white rounded-lg border">
					<div className="text-4xl mb-4">✅</div>
					<p className="text-gray-500 text-lg font-medium mb-2">
						No active alerts
					</p>
					<p className="text-gray-400 text-sm">
						All compliance items are up to date
					</p>
				</div>
			) : (
				<div className="space-y-4">
					{alerts.map((alert) => (
						<div
							key={alert.id}
							className={`border rounded-lg p-6 ${getSeverityColor(alert.severity)}`}>
							<div className="flex items-start justify-between">
								<div className="flex-1">
									<div className="flex items-center gap-3 mb-2">
										<span className="text-2xl">
											{alert.type === 'isp' ? '📋' : '🔥'}
										</span>
										<div>
											<h4 className="text-lg font-semibold">{alert.title}</h4>
											<p className="text-sm opacity-75">{alert.location}</p>
										</div>
									</div>

									<p className="text-sm mt-2">{alert.description}</p>

									<div className="flex items-center gap-4 mt-4 text-xs opacity-75">
										<span>Created: {formatDate(alert.createdAt)}</span>
										<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white bg-opacity-50">
											{alert.severity} severity
										</span>
									</div>
								</div>

								<button
									onClick={() => handleDismiss(alert.id)}
									disabled={isLoading}
									className="ml-4 px-4 py-2 bg-white bg-opacity-80 hover:bg-opacity-100 text-gray-700 rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-2">
									{isLoading && (
										<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700"></div>
									)}
									Dismiss
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
