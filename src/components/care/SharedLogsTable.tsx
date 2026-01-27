'use client';

import React from 'react';

interface SharedLogsTableProps {
    logs: any[];
}

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
    } catch (error) {
        
        // If parsing fails completely, try to show something useful
        // Strip any JSON formatting chars like {"content":"..."} if possible using regex as fallback?
        // Or just return raw
        return content.length > 200 
            ? content.substring(0, 200) + '...'
            : content;
    }
};

export default function SharedLogsTable({ logs }: SharedLogsTableProps) {
    // We need templates to properly format content if we want to be 100% accurate, 
    // but the previous inline version relied on `logs` having the `template` ID 
    // and `CareLogsWorkspace` having the `templates` state.
    // However, the `formatLogContent` function needs `templates`. 
    // We should probably pass `templates` or (better) let the consumer format it?
    // Actually, `CareLogsWorkspace` was using `templates` state.
    // For `CareResidentsWorkspace` and others, we might not have templates loaded?
    // Let's assume the logs coming in might have expanded content OR we pass templates.
    // To be safe and reuse logic, let's just do best-effort formatting or pass templates.
    // Or, for now, let's keep the logic self-contained if possible, or accept `templates` as prop.
    // The previous `LogsTable` in `CareLogsWorkspace` used `formatLogContent` which closed over `templates`.
    
    // To make this truly shared, we either need to fetch templates here (overhead) 
    // or pass them in.
    // Let's modify props to accept optional `templates`? Or just rely on raw content if missing?
    
    // Actually, `formatLogContent` is the tricky part. 
    // Let's try to infer as much as possible or accept `templates` as a prop.
    
    // WAIT: `CareResidentsWorkspace` does NOT fetch templates currently. 
    // It just fetches logs. If `logs` don't have expanded content, we might miss labels.
    // But `formatLogContent` fallback (key-value) is decent.
    
    return (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resident</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Template</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider flex-1">Content</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Author</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                    <div className="text-4xl mb-3">📝</div>
                                    <p>No logs found</p>
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(log.createdAt).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{log.residentName || '-'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                            {log.template
                                                ?.replace(/_/g, ' ')
                                                .replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Log'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-700 max-w-md break-words">
                                        {/* We can pass empty array for templates if we don't have them, 
                                            it will fall back to key-value display which is acceptable */}
                                        {formatLogContent(log.content, log.template, [])}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {log.authorName || 'Unknown'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                            {log.residentLocation || '-'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
