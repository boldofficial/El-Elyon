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

// ... formatLogContent function remains identical (lines 8-80) ...

export default function SharedLogsTable({ logs }: SharedLogsTableProps) {
    const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());

    const toggleExpand = (id: string) => {
        const newExpanded = new Set(expandedIds);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedIds(newExpanded);
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
                    const isExpanded = expandedIds.has(log.id);
                    return (
                        <div 
                            key={log.id} 
                            className={`bg-white rounded-lg shadow-sm border transition-all duration-200 ${isExpanded ? 'ring-1 ring-blue-500 border-blue-500' : 'hover:border-gray-300'}`}
                        >
                            <button
                                onClick={() => toggleExpand(log.id)}
                                className="w-full text-left px-4 py-3 sm:px-6 flex items-center justify-between gap-4 focus:outline-none"
                            >
                                <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                                    {/* Date */}
                                    <div className="md:col-span-3 text-sm text-gray-500">
                                        {new Date(log.createdAt).toLocaleString()}
                                    </div>
                                    
                                    {/* Resident */}
                                    <div className="md:col-span-3">
                                        <div className="text-sm font-medium text-gray-900 truncate">
                                            {log.residentName || 'Unknown Resident'}
                                        </div>
                                    </div>

                                    {/* Template */}
                                    <div className="md:col-span-3">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            log.template === 'daily_activities' 
                                            ? 'bg-purple-100 text-purple-800'
                                            : 'bg-blue-100 text-blue-800'
                                        }`}>
                                            {log.template
                                                ?.replace(/_/g, ' ')
                                                .replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Log'}
                                        </span>
                                    </div>

                                    {/* Author (Desktop only usually, but responsive grid) */}
                                    <div className="hidden md:block md:col-span-3 text-sm text-gray-500 truncate">
                                        {log.authorName || 'Unknown'}
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
                                        <div className="col-span-2 md:col-span-1">
                                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                                Content
                                            </h4>
                                            <div className="text-sm text-gray-800 whitespace-pre-wrap bg-white p-3 rounded border">
                                                {formatLogContent(log.content, log.template, [])}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                                    Details
                                                </h4>
                                                <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
                                                    <div className="flex justify-between">
                                                        <dt className="text-gray-500">Author:</dt>
                                                        <dd className="font-medium text-gray-900">{log.authorName || 'Unknown'}</dd>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <dt className="text-gray-500">Location:</dt>
                                                        <dd className="font-medium text-gray-900">{log.residentLocation || '-'}</dd>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <dt className="text-gray-500">Log ID:</dt>
                                                        <dd className="font-mono text-xs text-gray-400">{log.id.substring(0, 8)}...</dd>
                                                    </div>
                                                </dl>
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
