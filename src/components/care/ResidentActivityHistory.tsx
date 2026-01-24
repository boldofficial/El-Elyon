'use client';

import React, {useState, useEffect} from 'react';
import {format} from 'date-fns';

interface Activity {
	id: string;
	activityType: string;
	completed: boolean;
	notes: string | null;
}

interface Log {
	id: string;
	residentId: string;
	content: string;
    template?: string;
	createdAt: string;
	authorName?: string;
	activities: Activity[];
}

interface Props {
	residentId: string;
}

export default function ResidentActivityHistory({residentId}: Props) {
	const [logs, setLogs] = useState<Log[]>([]);
	const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function fetchLogs() {
			setLoading(true);
            setError(null);
			try {
				const res = await fetch(
					`/api/care/resident-logs?residentId=${residentId}&limit=50`
				);
				if (!res.ok) throw new Error('Failed to fetch logs');
				const data = await res.json();
				setLogs(data);
			} catch (error: any) {
				console.error('Error fetching logs:', error);
                setError(error.message || 'Failed to load history');
			} finally {
				setLoading(false);
			}
		}

		fetchLogs();
	}, [residentId]);

	if (loading) {
		return (
			<div className="flex justify-center py-8">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
		);
	}

    if (error) {
        return <div className="text-red-500 text-center py-8">{error}</div>;
    }

	if (logs.length === 0) {
		return (
			<div className="text-center py-12 text-gray-500">
				<p>No activity history found.</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{logs.map((log) => {
                // Determine layout based on template
                const isActivityLog = log.template === 'daily_activities';
                
                return (
                    <div key={log.id} className="bg-white border rounded-lg p-4 shadow-sm">
                        <div className="flex justify-between items-start mb-3 border-b pb-2">
                            <div>
                                <h3 className="font-semibold text-gray-900">
                                    {isActivityLog ? 'Daily Activity Log' : 'Note/Log'}
                                </h3>
                                <p className="text-sm text-gray-500">
                                    {format(new Date(log.createdAt), 'PPP p')}
                                </p>
                            </div>
                            {log.authorName && (
                                <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
                                    by {log.authorName}
                                </span>
                            )}
                        </div>

                        {/* General Content/Notes */}
                        {log.content && (
                            <div className="mb-4">
                                <h4 className="text-sm font-medium text-gray-700 mb-1">General Notes:</h4>
                                <p className="text-gray-800 whitespace-pre-wrap text-sm bg-gray-50 p-2 rounded">
                                    {log.content}
                                </p>
                            </div>
                        )}

                        {/* Activities List */}
                        {log.activities && log.activities.length > 0 && (
                            <div>
                                <h4 className="text-sm font-medium text-gray-700 mb-2">Activities:</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {log.activities.map((activity) => (
                                        <div 
                                            key={activity.id} 
                                            className={`border rounded p-2 text-sm ${activity.completed ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-gray-900">
                                                    {activity.activityType}
                                                </span>
                                                {activity.completed ? (
                                                    <span className="text-green-600 text-xs font-bold">✓ Done</span>
                                                ) : (
                                                    <span className="text-gray-500 text-xs">Not Done</span>
                                                )}
                                            </div>
                                            {activity.notes && (
                                                <p className="mt-1 text-gray-600 text-xs border-t pt-1 mt-1">
                                                    {activity.notes}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
		</div>
	);
}
