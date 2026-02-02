'use client';

import React, {useState, useEffect} from 'react';
import {format} from 'date-fns';
import SharedLogsTable from './SharedLogsTable';

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
            <SharedLogsTable logs={logs} />
		</div>
	);
}
