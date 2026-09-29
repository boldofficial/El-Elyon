import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

export default function ComplianceAlerts() {
	const [alerts, setAlerts] = useState<any[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isFetching, setIsFetching] = useState(true);
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

	// Dismiss one or more alerts (a group's "Dismiss all" passes several ids)
	const handleDismiss = async (alertIds: string[]) => {
		setIsLoading(true);
		try {
			for (const alertId of alertIds) {
				const response = await fetch('/api/admin/compliance/dismiss-alert', {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({alertId}),
				});

				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.error || 'Failed to dismiss alert');
				}
			}

			toast.success(
				alertIds.length > 1 ? 'Alerts dismissed' : 'Alert dismissed successfully',
			);
		} catch (error: any) {
			console.error('Error dismissing alert:', error);
			toast.error(error.message || 'Failed to dismiss alert');
		} finally {
			setIsLoading(false);
			fetchAlerts(); // Refresh even on partial failure
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

	// Group alerts of the same type/title/severity under one collapsible header
	const groups = Object.values(
		alerts.reduce<Record<string, {key: string; alerts: any[]}>>((acc, alert) => {
			const key = `${alert.type}|${alert.title}|${alert.severity}`;
			(acc[key] ??= {key, alerts: []}).alerts.push(alert);
			return acc;
		}, {}),
	);

	const toggleGroup = (key: string) =>
		setCollapsed((prev) => ({...prev, [key]: !prev[key]}));

	if (isFetching) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
				<span className="ml-2 text-gray-600">Loading alerts...</span>
			</div>
		);
	}

	return (
		<div className="space-y-6 mb-6">
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
				<div className="space-y-3">
					{groups.map(({key, alerts: items}) => {
						const first = items[0];
						const isCollapsed = !!collapsed[key];
						return (
							<div
								key={key}
								className={`border rounded-lg overflow-hidden ${getSeverityColor(first.severity)}`}>
								<div className="flex items-center gap-3 px-4 py-3">
									<button
										onClick={() => toggleGroup(key)}
										aria-expanded={!isCollapsed}
										className="flex flex-1 items-center gap-3 text-left">
										<span className="text-xl">
											{first.type === 'isp' ? '📋' : '🔥'}
										</span>
										<span className="font-semibold">{first.title}</span>
										<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white bg-opacity-60">
											{items.length} {items.length === 1 ? 'alert' : 'alerts'} ·{' '}
											{first.severity}
										</span>
										<span className="ml-auto text-sm opacity-60">
											{isCollapsed ? '▾' : '▴'}
										</span>
									</button>
									{items.length > 1 && (
										<button
											onClick={() => handleDismiss(items.map((a) => a.id))}
											disabled={isLoading}
											className="px-3 py-1.5 bg-white bg-opacity-80 hover:bg-opacity-100 text-gray-700 rounded-md text-sm font-medium disabled:opacity-50">
											Dismiss all
										</button>
									)}
								</div>

								{!isCollapsed && (
									<div className="bg-white text-gray-800">
										{items.map((alert) => {
											// Resident alerts (ISP, fire evac, admission drill) name the
											// resident only in the description; show it, plus the home
											// when the description doesn't already say which one.
											const namesLocation = alert.description
												?.toLowerCase()
												.includes(alert.location?.toLowerCase());
											return (
												<div
													key={alert.id}
													className="flex items-center gap-3 px-4 py-2 border-t border-gray-100 text-sm">
													<div className="flex-1 min-w-0">
														<p className="font-medium">{alert.description}</p>
														{!namesLocation && (
															<p className="text-xs text-gray-500">
																{alert.location}
															</p>
														)}
													</div>
													<span className="text-gray-500 text-xs whitespace-nowrap">
														{formatDate(alert.createdAt)}
													</span>
													<button
														onClick={() => handleDismiss([alert.id])}
														disabled={isLoading}
														className="px-3 py-1 border border-gray-200 hover:bg-gray-50 rounded-md text-sm font-medium disabled:opacity-50">
														Dismiss
													</button>
												</div>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
