'use client';

import React from 'react';

interface SharedLogsTableProps {
    logs: any[];
}

const EDIT_WINDOW_MS = 60 * 60 * 1000;

export const formatLogContent = (content: string, template: string | undefined, allTemplates: any[] = []) => {
    // Handle empty or invalid content
    if (!content || content.trim() === '') {
        return 'No content';
    }

    try {
        // Parse the content - might need multiple parses if double-encoded
        let parsed = JSON.parse(content);
        
        // If it's still a string after first parse, parse again (double-encoded case)
        if (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
        }

        // If parsed is still a string or empty object, show default message
        if (typeof parsed === 'string' || Object.keys(parsed).length === 0) {
            return 'No content';
        }

        // [NEW] If it's a simple object with just a "content" key (common in some editors), unpack it
        if (Object.keys(parsed).length === 1 && parsed.content && typeof parsed.content === 'string') {
                // Check if *that* content is also JSON
            try {
                const inner = JSON.parse(parsed.content);
                if (typeof inner === 'object') parsed = inner;
                else return parsed.content;
            } catch {
                    return parsed.content;
            }
        }

        const templateData = allTemplates.find((t) => t.id === template);

        if (!templateData || !templateData.fields) {
            // If no template found, display the parsed object as key-value pairs
            return Object.entries(parsed)
                .map(([key, value]) => {
                        if (key === 'content') return value; // Don't show "content: ..." prefix for simple fields
                        return `${key}: ${value || '-'}`;
                })
                .join(', ') || 'No content';
        }

        // Format according to template fields
        const formattedContent = templateData.fields
            .map((field: any) => {
                const value = parsed[field.name];
                // Only show fields that have values
                if (!value || value.trim() === '') {
                    return null;
                }
                // For textareas/long text, just show the value. For labelled fields, show Label: Value
                if (field.type === 'textarea' || field.name === 'content' || field.name === 'note') {
                    return value;
                }
                return `${field.label}: ${value}`;
            })
            .filter(Boolean) // Remove null entries
            .join(' | ');

        return formattedContent || 'No content';
    } catch {
        // Plain-text log entries are valid content and should be shown in full.
        return content;
    }
};

function getEditableLogContent(content: string | null | undefined) {
    if (!content) return '';

    try {
        const parsed = JSON.parse(content);
        if (
            parsed &&
            typeof parsed === 'object' &&
            typeof parsed.content === 'string'
        ) {
            return parsed.content;
        }
    } catch {
        // Plain-text logs are expected here.
    }

    return content;
}

function isWithinEditWindow(createdAt: string | Date | null | undefined) {
    if (!createdAt) return false;
    const created = new Date(createdAt).getTime();
    if (Number.isNaN(created)) return false;
    return Date.now() - created <= EDIT_WINDOW_MS;
}

export default function SharedLogsTable({ logs }: SharedLogsTableProps) {
    const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
    const [activitiesById, setActivitiesById] = React.useState<Record<string, any[]>>({});
    const [loadingActivities, setLoadingActivities] = React.useState<Record<string, boolean>>({});
    const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
    const [logUpdates, setLogUpdates] = React.useState<Record<string, any>>({});
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editContent, setEditContent] = React.useState('');
    const [editActivities, setEditActivities] = React.useState<any[]>([]);
    const [savingEdit, setSavingEdit] = React.useState(false);
    const [editError, setEditError] = React.useState<string | null>(null);

    React.useEffect(() => {
        async function fetchCurrentUser() {
            try {
                const res = await fetch('/api/users/current');
                if (!res.ok) return;
                const user = await res.json();
                setCurrentUserId(user?.clerkUserId || null);
            } catch {
                setCurrentUserId(null);
            }
        }

        fetchCurrentUser();
    }, []);

    const fetchActivitiesIfMissing = async (log: any) => {
        if ((log.activities && log.activities.length > 0) || activitiesById[log.id]) return;
        setLoadingActivities((prev) => ({...prev, [log.id]: true}));
        try {
            const res = await fetch(`/api/care/resident-logs/${log.id}/activities`);
            if (!res.ok) return;
            const activities = await res.json();
            setActivitiesById((prev) => ({...prev, [log.id]: activities}));
        } catch (_err) {
            // Silent failure; we still show "No activities recorded"
        } finally {
            setLoadingActivities((prev) => ({...prev, [log.id]: false}));
        }
    };

    const toggleExpand = (log: any) => {
        const newExpanded = new Set(expandedIds);
        if (newExpanded.has(log.id)) {
            newExpanded.delete(log.id);
        } else {
            newExpanded.add(log.id);
            fetchActivitiesIfMissing(log);
        }
        setExpandedIds(newExpanded);
    };

    const startEditing = async (log: any) => {
        setEditError(null);
        setEditingId(log.id);
        setEditContent(getEditableLogContent(log.content));
        setLoadingActivities((prev) => ({...prev, [log.id]: true}));

        try {
            const res = await fetch(`/api/care/resident-logs/${log.id}/activities`);
            const activities = res.ok ? await res.json() : log.activities || [];
            setActivitiesById((prev) => ({...prev, [log.id]: activities}));
            setEditActivities(activities);
        } catch {
            setEditActivities(log.activities || []);
        } finally {
            setLoadingActivities((prev) => ({...prev, [log.id]: false}));
        }
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditContent('');
        setEditActivities([]);
        setEditError(null);
    };

    const updateEditActivity = (
        activityId: string,
        changes: {completed?: boolean; notes?: string}
    ) => {
        setEditActivities((prev) =>
            prev.map((activity) =>
                activity.id === activityId ? {...activity, ...changes} : activity
            )
        );
    };

    const saveEdit = async (log: any) => {
        setEditError(null);

        if (!editContent.trim()) {
            setEditError('General notes are required.');
            return;
        }

        if (!editActivities.some((activity) => activity.completed)) {
            setEditError('At least one activity must be checked.');
            return;
        }

        setSavingEdit(true);
        try {
            const res = await fetch(`/api/care/resident-logs/${log.id}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    content: editContent,
                    activities: editActivities,
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to edit log');
            }

            setLogUpdates((prev) => ({
                ...prev,
                [log.id]: {
                    content: data.content,
                    activities: data.activities || editActivities,
                },
            }));
            setActivitiesById((prev) => ({
                ...prev,
                [log.id]: data.activities || editActivities,
            }));
            cancelEditing();
        } catch (error) {
            setEditError(error instanceof Error ? error.message : 'Failed to edit log');
        } finally {
            setSavingEdit(false);
        }
    };

    return (
        <div className="space-y-3">
             {logs.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
                    <div className="text-4xl mb-3">📝</div>
                    <p>No logs found</p>
                </div>
            ) : (
                logs.map((log) => {
                    const displayLog = {...log, ...(logUpdates[log.id] || {})};
                    const isExpanded = expandedIds.has(displayLog.id);
                    const isEditing = editingId === displayLog.id;
                    const canEdit =
                        currentUserId === displayLog.authorId &&
                        isWithinEditWindow(displayLog.createdAt);
                    const visibleActivities = activitiesById[displayLog.id] || displayLog.activities || [];
                    return (
                        <div 
                            key={displayLog.id} 
                            className={`bg-white rounded-lg shadow-sm border transition-all duration-200 ${isExpanded ? 'ring-1 ring-blue-500 border-blue-500' : 'hover:border-gray-300'}`}
                        >
                            <button
                                onClick={() => toggleExpand(displayLog)}
                                className="w-full text-left px-4 py-3 sm:px-6 flex items-center justify-between gap-4 focus:outline-none"
                            >
                                <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                                    {/* Date */}
                                    <div className="md:col-span-3 text-sm text-gray-500">
                                        {new Date(displayLog.createdAt).toLocaleString()}
                                    </div>
                                    
                                    {/* Resident */}
                                    <div className="md:col-span-3">
                                        <div className="text-sm font-medium text-gray-900 truncate">
                                            {displayLog.residentName || 'Unknown Resident'}
                                        </div>
                                    </div>

                                    {/* Template */}
                                    <div className="md:col-span-3">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            displayLog.template === 'daily_activities' 
                                            ? 'bg-purple-100 text-purple-800'
                                            : 'bg-blue-100 text-blue-800'
                                        }`}>
                                            {displayLog.template
                                                ?.replace(/_/g, ' ')
                                                .replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Log'}
                                        </span>
                                    </div>

                                    {/* Author (Desktop only usually, but responsive grid) */}
                                    <div className="hidden md:block md:col-span-3 text-sm text-gray-500 truncate">
                                        {displayLog.authorName || 'Unknown'}
                                    </div>
                                </div>

                                {/* Arrow Icon */}
                                <div className="ml-2 flex-shrink-0 text-gray-400">
                                    <svg 
                                        className={`h-5 w-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                                        viewBox="0 0 20 20" 
                                        fill="currentColor"
                                    >
                                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            </button>

                            {/* Expanded Content */}
                            {isExpanded && (
                                <div className="border-t px-4 py-4 sm:px-6 bg-gray-50 rounded-b-lg">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="col-span-2 md:col-span-1 space-y-3">
                                            <div>
                                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                                    Content
                                                </h4>
                                                {isEditing ? (
                                                    <textarea
                                                        value={editContent}
                                                        onChange={(event) => setEditContent(event.target.value)}
                                                        rows={5}
                                                        className="w-full text-sm text-gray-800 bg-white p-3 rounded border"
                                                    />
                                                ) : (
                                                    <div className="text-sm text-gray-800 whitespace-pre-wrap bg-white p-3 rounded border">
                                                        {formatLogContent(displayLog.content, displayLog.template, [])}
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                                    Activities
                                                </h4>
                                                {isEditing ? (
                                                    <ul className="space-y-2">
                                                        {editActivities.map((activity: any) => (
                                                            <li
                                                                key={activity.id}
                                                                className="bg-white p-3 rounded border text-sm"
                                                            >
                                                                <label className="flex items-start gap-3">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={!!activity.completed}
                                                                        onChange={(event) =>
                                                                            updateEditActivity(activity.id, {
                                                                                completed: event.target.checked,
                                                                            })
                                                                        }
                                                                        className="mt-1 h-4 w-4 rounded border-gray-300"
                                                                    />
                                                                    <div className="flex-1">
                                                                        <div className="font-medium text-gray-900">
                                                                            {activity.activityType}
                                                                        </div>
                                                                        <textarea
                                                                            value={activity.notes || ''}
                                                                            onChange={(event) =>
                                                                                updateEditActivity(activity.id, {
                                                                                    notes: event.target.value,
                                                                                })
                                                                            }
                                                                            rows={2}
                                                                            placeholder="Activity notes"
                                                                            className="mt-2 w-full border rounded px-3 py-2 text-sm"
                                                                        />
                                                                    </div>
                                                                </label>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : visibleActivities.length > 0 ? (
                                                    <ul className="space-y-2">
                                                        {visibleActivities
                                                            // Only show activities that were completed or have notes; omit untouched ones
                                                            .filter((activity: any) => activity.completed || (activity.notes && activity.notes.trim() !== ''))
                                                            .map((activity: any) => (
                                                            <li
                                                                key={activity.id}
                                                                className="flex items-start justify-between bg-white p-3 rounded border text-sm"
                                                            >
                                                                <div className="flex-1 pr-3">
                                                                    <div className="font-medium text-gray-900">
                                                                        {activity.activityType}
                                                                    </div>
                                                                    {activity.notes ? (
                                                                        <div className="text-gray-600 mt-1 whitespace-pre-wrap">
                                                                            {activity.notes}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                                <span
                                                                    className={`px-2 py-1 rounded text-xs font-semibold ${
                                                                        activity.completed
                                                                            ? 'bg-green-100 text-green-800'
                                                                            : 'bg-gray-100 text-gray-600'
                                                                    }`}
                                                                >
                                                                    {activity.completed ? 'Done' : 'Pending'}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <div className="text-sm text-gray-500 bg-white p-3 rounded border">
                                                        {loadingActivities[displayLog.id]
                                                            ? 'Loading activities...'
                                                            : 'No activities recorded'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <div className="flex items-center justify-between gap-3 mb-1">
                                                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                        Details
                                                    </h4>
                                                    {canEdit && !isEditing && (
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditing(displayLog)}
                                                            className="px-3 py-1 text-xs font-medium rounded border border-blue-600 text-blue-700 hover:bg-blue-50">
                                                            Edit
                                                        </button>
                                                    )}
                                                </div>
                                                <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
                                                    <div className="flex justify-between">
                                                        <dt className="text-gray-500">Author:</dt>
                                                        <dd className="font-medium text-gray-900">{displayLog.authorName || 'Unknown'}</dd>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <dt className="text-gray-500">Location:</dt>
                                                        <dd className="font-medium text-gray-900">{displayLog.residentLocation || '-'}</dd>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <dt className="text-gray-500">Log ID:</dt>
                                                        <dd className="font-mono text-xs text-gray-400">{displayLog.id.substring(0, 8)}...</dd>
                                                    </div>
                                                </dl>
                                                {canEdit && !isEditing && (
                                                    <p className="mt-3 text-xs text-gray-500">
                                                        Editable for 1 hour after submission.
                                                    </p>
                                                )}
                                                {!canEdit && currentUserId === displayLog.authorId && (
                                                    <p className="mt-3 text-xs text-gray-500">
                                                        The 1-hour edit window has closed.
                                                    </p>
                                                )}
                                                {isEditing && (
                                                    <div className="mt-4 space-y-3">
                                                        {editError && (
                                                            <p className="text-sm text-red-600">{editError}</p>
                                                        )}
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={cancelEditing}
                                                                disabled={savingEdit}
                                                                className="px-3 py-2 text-sm rounded border hover:bg-gray-50 disabled:opacity-50">
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => saveEdit(displayLog)}
                                                                disabled={savingEdit}
                                                                className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                                                                {savingEdit ? 'Saving...' : 'Save Edit'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}
