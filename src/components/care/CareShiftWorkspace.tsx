import React, { useState, useEffect } from "react";
import SelfieCapture from "./SelfieCapture";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { Id } from "../../convex/_generated/dataModel";

export default function CareShiftWorkspace() {
  const sessionInfo = useQuery(api.access.getSessionInfo);
  const currentShift = useQuery(api.care.getCurrentShift);
  const isSelfieEnforced = useQuery(api.care.isSelfieEnforced);
  const clockIn = useMutation(api.care.clockIn);
  const clockOut = useMutation(api.care.clockOut);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSelfieCapture, setShowSelfieCapture] = useState(false);
  const [selfieAction, setSelfieAction] = useState<"clockIn" | "clockOut" | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update current time every second for live duration display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleClockIn = async () => {
    if (!sessionInfo?.locations?.length) {
      toast.error("No assigned locations. Contact your supervisor.");
      return;
    }

    // Check if selfie is required
    if (isSelfieEnforced) {
      setSelfieAction("clockIn");
      setShowSelfieCapture(true);
      return;
    }

    // Proceed without selfie
    setIsProcessing(true);
    try {
      await clockIn({
        location: sessionInfo.locations[0],
      });
      toast.success("Clocked in successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to clock in");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClockOut = async () => {
    if (!currentShift) return;

    // Clock out without selfie requirement
    setIsProcessing(true);
    try {
      await clockOut({});
      toast.success("Clocked out successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to clock out");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelfieCapture = async (storageId: Id<"_storage">) => {
    setShowSelfieCapture(false);
    setIsProcessing(true);
    try {
      await clockIn({ location: sessionInfo!.locations[0], selfieStorageId: storageId });
      toast.success("Clocked in with selfie");
    } catch (error: any) {
      toast.error(error.message || "Failed to clock in");
    } finally {
      setIsProcessing(false);
      setSelfieAction(null);
    }
  };

  const formatDuration = (startTime: number) => {
    const duration = currentTime - startTime;
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((duration % (1000 * 60)) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  if (showSelfieCapture) {
    return (
      <SelfieCapture
        onCapture={handleSelfieCapture}
        onCancel={() => { setShowSelfieCapture(false); setSelfieAction(null); }}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Shift Management</h2>
        <p className="text-gray-600">Clock in and out of your shifts</p>
      </div>

      {/* Current Status */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="text-center">
          {currentShift ? (
            <div className="space-y-4">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-green-100 text-green-800">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                Currently Clocked In
              </div>
              
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Started: {new Date(currentShift.clockInTime).toLocaleString()}
                </p>
                <p className="text-sm text-gray-600">
                  Location: {currentShift.location}
                </p>
                <p className="text-lg font-semibold text-gray-900">
                  Duration: {formatDuration(currentShift.clockInTime)}
                </p>
              </div>

              <button
                onClick={handleClockOut}
                disabled={isProcessing}
                className="w-full max-w-xs mx-auto bg-red-600 text-white py-3 px-6 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isProcessing ? "Clocking Out..." : "Clock Out"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-gray-100 text-gray-600">
                <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
                Not Clocked In
              </div>

              {sessionInfo?.locations?.length ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    Assigned Location: {sessionInfo.locations.join(", ")}
                  </p>
                  <button
                    onClick={handleClockIn}
                    disabled={isProcessing}
                    className="w-full max-w-xs mx-auto bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isProcessing ? "Clocking In..." : "Clock In"}
                  </button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-600 mb-2">No assigned locations</p>
                  <p className="text-sm text-gray-500">Contact your supervisor to get assigned to locations</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Shift Guidelines */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <h3 className="font-semibold text-blue-900 mb-3">Shift Guidelines</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Clock in at the start of your scheduled shift</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Clock out at the end of your shift or when leaving the facility</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Contact your supervisor for any time adjustments needed</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>All clock in/out times are automatically recorded for payroll</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

/////

import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export default function CareResidentsWorkspace() {
  const sessionInfo = useQuery(api.access.getSessionInfo);
  const residents = useQuery(api.care.getMyResidents) || [];
  const [selectedResident, setSelectedResident] = useState<Id<"residents"> | null>(null);
  const residentLogs = useQuery(
    api.care.getResidentLogs,
    selectedResident ? { residentId: selectedResident, limit: 10 } : "skip"
  );
  const ispStatus = useQuery(
    api.care.getResidentIspStatus,
    selectedResident ? { residentId: selectedResident } : "skip"
  );

  const handleResidentSelect = (residentId: Id<"residents">) => {
    setSelectedResident(residentId);
  };

  const handleBackToList = () => {
    setSelectedResident(null);
  };

  const selectedResidentData = residents.find(r => r.id === selectedResident);
  
  if (selectedResident && selectedResidentData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleBackToList}
            className="flex items-center text-blue-600 hover:text-blue-700"
          >
            <span className="mr-2">←</span>
            Back to Residents
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{selectedResidentData.name}</h2>
              <p className="text-gray-600">Location: {selectedResidentData.location}</p>
            </div>

            {selectedResidentData.dob && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Date of Birth</label>
                <p className="text-gray-900">{new Date(selectedResidentData.dob).toLocaleDateString()}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">Resident Since</label>
              <p className="text-gray-900">{selectedResidentData.createdAt ? new Date(selectedResidentData.createdAt).toLocaleDateString() : 'Unknown'}</p>
            </div>

            {/* ISP Status */}
            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-2">Individual Service Plan (ISP)</h3>
              {ispStatus ? (
                <div className={`border rounded-lg p-4 ${ispStatus.acknowledged ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-medium ${ispStatus.acknowledged ? 'text-green-800' : 'text-yellow-800'}`}>
                        Current ISP Active
                      </p>
                      <p className={`text-sm ${ispStatus.acknowledged ? 'text-green-600' : 'text-yellow-600'}`}>
                        Version {ispStatus.version} • 
                        {ispStatus.dueAt && ` Due: ${new Date(ispStatus.dueAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="text-right">
                      {ispStatus.acknowledged ? (
                        <p className="text-sm text-green-600">
                          ✓ Acknowledged
                        </p>
                      ) : (
                        <p className="text-sm text-yellow-600">
                          ⚠ Needs Acknowledgment
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="font-medium text-gray-800">No Active ISP</p>
                  <p className="text-sm text-gray-600">Contact supervisor to create ISP</p>
                </div>
              )}
            </div>

            {/* Recent Logs */}
            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-2">Recent Logs</h3>
              {residentLogs && residentLogs.length > 0 ? (
                <div className="space-y-2">
                  {residentLogs.map((log: any) => (
                    <div key={log.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {log.template.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                          </p>
                          <p className="text-sm text-gray-600 mt-1">
                            By: {log.authorName}
                          </p>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {log.content.length > 100 ? log.content.substring(0, 100) + "..." : log.content}
                          </p>
                        </div>
                        <div className="text-xs text-gray-500 ml-4">
                          {new Date(log.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No recent logs</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Residents</h2>
        <p className="text-gray-600">
          Location-scoped resident list • {sessionInfo?.locations?.join(", ") || "No locations assigned"}
        </p>
      </div>

      {residents.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🏠</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Residents Found</h3>
          <p className="text-gray-600">
            {sessionInfo?.locations?.length 
              ? "No residents in your assigned locations"
              : "You are not assigned to any locations"
            }
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Resident Directory ({residents.length})</h3>
          </div>
          
          <div className="divide-y divide-gray-200">
            {residents.map((resident: any) => (
              <button
                key={resident.id}
                onClick={() => handleResidentSelect(resident.id)}
                className="w-full px-6 py-4 text-left hover:bg-gray-50 transition-colors focus:outline-none focus:bg-blue-50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-semibold">
                          {resident.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{resident.name}</p>
                        <p className="text-sm text-gray-600">Location: {resident.location}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Resident
                    </span>
                    
                    <span className="text-gray-400">→</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


/////


import React, {useState} from 'react';
import {useQuery, useMutation} from 'convex/react';
import {api} from '../../convex/_generated/api';

export default function CareLogsWorkspace() {
	const [activeTab, setActiveTab] = useState<'create' | 'view' | 'search'>(
		'view'
	);
	const [selectedResident, setSelectedResident] = useState<string>('');
	const [selectedTemplate, setSelectedTemplate] = useState<string>('');
	const [logContent, setLogContent] = useState<Record<string, string>>({});
	const [searchQuery, setSearchQuery] = useState('');
	const [searchFilters, setSearchFilters] = useState({
		residentId: '',
		template: '',
		dateFrom: '',
		dateTo: '',
	});
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Helper function to format dates safely
	const formatDate = (timestamp: number | undefined) => {
		if (!timestamp) return 'Unknown date';
		return new Date(timestamp).toLocaleString();
	};

	const residents = useQuery(api.care.getMyResidents) || [];
	const templates = useQuery(api.care.getLogTemplates) || [];
	const recentLogs = useQuery(api.care.getResidentLogs, {limit: 20});
	const logsSummary = useQuery(api.care.getRecentLogsSummary);
	const createLog = useMutation(api.care.createResidentLog);

	// Search logs when filters change
	const searchResults = useQuery(
		api.care.searchLogs,
		searchQuery.trim() || Object.values(searchFilters).some((v) => v)
			? {
					query: searchQuery,
					residentId: searchFilters.residentId
						? (searchFilters.residentId as any)
						: undefined,
					template: searchFilters.template || undefined,
					dateFrom: searchFilters.dateFrom
						? new Date(searchFilters.dateFrom).getTime()
						: undefined,
					dateTo: searchFilters.dateTo
						? new Date(searchFilters.dateTo).getTime()
						: undefined,
					limit: 50,
				}
			: 'skip'
	);

	const selectedTemplateData = templates.find((t) => t.id === selectedTemplate);

	const handleFieldChange = (fieldName: string, value: string) => {
		setLogContent((prev) => ({
			...prev,
			[fieldName]: value,
		}));
	};

	const handleSubmitLog = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!selectedResident || !selectedTemplate) return;

		setIsSubmitting(true);
		try {
			const content = JSON.stringify(logContent);
			console.log('Submitting log with content:', logContent);
			console.log('Stringified content:', content);
			await createLog({
				residentId: selectedResident as any,
				template: selectedTemplate,
				content,
			});

			// Reset form
			setLogContent({});
			setSelectedResident('');
			setSelectedTemplate('');
			alert('Log created successfully!');
		} catch (error) {
			alert('Error creating log: ' + (error as Error).message);
		} finally {
			setIsSubmitting(false);
		}
	};

	const formatLogContent = (content: string, template: string | undefined) => {
		try {
			const parsed = JSON.parse(content);
			const templateData = templates.find((t) => t.id === template);

			if (!templateData) return content;

			return templateData.fields
				.map((field) => {
					const value = parsed[field.name] || 'Not specified';
					return `${field.label}: ${value}`;
				})
				.join('\n');
		} catch {
			return content;
		}
	};

	const renderCreateTab = () => (
		<div className="space-y-6">
			<div className="bg-white rounded-lg shadow-sm border p-6">
				<h3 className="text-lg font-semibold mb-4">Create New Log Entry</h3>

				<form onSubmit={handleSubmitLog} className="space-y-4">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Select Resident *
							</label>
							<select
								value={selectedResident}
								onChange={(e) => setSelectedResident(e.target.value)}
								className="w-full border border-gray-300 rounded-md px-3 py-2"
								required
								disabled={isSubmitting}>
								<option value="">Choose a resident...</option>
								{residents.map((resident) => (
									<option key={resident.id} value={resident.id}>
										{resident.name} ({resident.location})
									</option>
								))}
							</select>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Log Template *
							</label>
							<select
								value={selectedTemplate}
								onChange={(e) => {
									setSelectedTemplate(e.target.value);
									setLogContent({});
								}}
								className="w-full border border-gray-300 rounded-md px-3 py-2"
								required
								disabled={isSubmitting}>
								<option value="">Choose a template...</option>
								{templates.map((template) => (
									<option key={template.id} value={template.id}>
										{template.name}
									</option>
								))}
							</select>
						</div>
					</div>

					{selectedTemplateData && (
						<div className="space-y-4 p-4 bg-gray-50 rounded-lg">
							<h4 className="font-medium text-gray-900">
								{selectedTemplateData.name}
							</h4>
							<p className="text-sm text-gray-600">
								{selectedTemplateData.description}
							</p>

							{selectedTemplateData.fields.map((field) => (
								<div key={field.name}>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										{field.label}
									</label>

									{field.type === 'textarea' ? (
										<textarea
											value={logContent[field.name] || ''}
											onChange={(e) =>
												handleFieldChange(field.name, e.target.value)
											}
											className="w-full border border-gray-300 rounded-md px-3 py-2"
											rows={3}
											disabled={isSubmitting}
										/>
									) : field.type === 'select' ? (
										<select
											value={logContent[field.name] || ''}
											onChange={(e) =>
												handleFieldChange(field.name, e.target.value)
											}
											className="w-full border border-gray-300 rounded-md px-3 py-2"
											disabled={isSubmitting}>
											<option value="">Select...</option>
											{field.options?.map((option) => (
												<option key={option} value={option}>
													{option}
												</option>
											))}
										</select>
									) : (
										<input
											type={field.type}
											value={logContent[field.name] || ''}
											onChange={(e) =>
												handleFieldChange(field.name, e.target.value)
											}
											className="w-full border border-gray-300 rounded-md px-3 py-2"
											disabled={isSubmitting}
										/>
									)}
								</div>
							))}
						</div>
					)}

					<div className="flex justify-end">
						<button
							type="submit"
							disabled={!selectedResident || !selectedTemplate || isSubmitting}
							className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
							{isSubmitting ? 'Creating...' : 'Create Log Entry'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);

	const renderViewTab = () => (
		<div className="space-y-6">
			{/* Summary Cards */}
			{logsSummary && (
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
					<div className="bg-white rounded-lg shadow-sm border p-4">
						<div className="flex items-center">
							<div className="p-2 bg-blue-100 rounded-lg">
								<svg
									className="w-5 h-5 text-blue-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
									/>
								</svg>
							</div>
							<div className="ml-3">
								<p className="text-sm font-medium text-gray-600">
									Total Logs (7 days)
								</p>
								<p className="text-xl font-semibold text-gray-900">
									{logsSummary.totalLogs}
								</p>
							</div>
						</div>
					</div>

					<div className="bg-white rounded-lg shadow-sm border p-4">
						<div className="flex items-center">
							<div className="p-2 bg-green-100 rounded-lg">
								<svg
									className="w-5 h-5 text-green-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
									/>
								</svg>
							</div>
							<div className="ml-3">
								<p className="text-sm font-medium text-gray-600">My Logs</p>
								<p className="text-xl font-semibold text-gray-900">
									{logsSummary.myLogs}
								</p>
							</div>
						</div>
					</div>

					<div className="bg-white rounded-lg shadow-sm border p-4">
						<div className="flex items-center">
							<div className="p-2 bg-purple-100 rounded-lg">
								<svg
									className="w-5 h-5 text-purple-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
									/>
								</svg>
							</div>
							<div className="ml-3">
								<p className="text-sm font-medium text-gray-600">Locations</p>
								<p className="text-xl font-semibold text-gray-900">
									{Object.keys(logsSummary.logsByLocation).length}
								</p>
							</div>
						</div>
					</div>

					<div className="bg-white rounded-lg shadow-sm border p-4">
						<div className="flex items-center">
							<div className="p-2 bg-orange-100 rounded-lg">
								<svg
									className="w-5 h-5 text-orange-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
									/>
								</svg>
							</div>
							<div className="ml-3">
								<p className="text-sm font-medium text-gray-600">
									Templates Used
								</p>
								<p className="text-xl font-semibold text-gray-900">
									{Object.keys(logsSummary.logsByTemplate).length}
								</p>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Recent Logs */}
			<div className="bg-white rounded-lg shadow-sm border">
				<div className="px-6 py-4 border-b border-gray-200">
					<h3 className="text-lg font-semibold">Recent Log Entries</h3>
					<p className="text-sm text-gray-600">
						All logs from your accessible locations
					</p>
				</div>

				<div className="divide-y divide-gray-200">
					{!recentLogs || recentLogs.length === 0 ? (
						<div className="p-8 text-center text-gray-500">
							<div className="text-4xl mb-4">📝</div>
							<p className="text-lg font-medium mb-2">No logs found</p>
							<p className="text-sm">
								Log entries will appear here once created
							</p>
						</div>
					) : (
						recentLogs.map((log) => (
							<div key={log.id} className="p-6">
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex items-center space-x-3 mb-2">
											<h4 className="text-lg font-medium text-gray-900">
												{log.residentName}
											</h4>
											<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
												{log.template
													?.replace(/_/g, ' ')
													.replace(/\b\w/g, (l) => l.toUpperCase()) ||
													'Unknown'}
											</span>
											<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
												{log.residentLocation}
											</span>
										</div>

										<div className="text-sm text-gray-600 mb-3">
											<div className="flex items-center space-x-4">
												<span>By: {log.authorName}</span>
												<span>Version: {log.version}</span>
												<span>
													{log.createdAt
														? new Date(log.createdAt).toLocaleString()
														: 'Unknown date'}
												</span>
											</div>
										</div>

										<div className="bg-gray-50 rounded-lg p-3">
											<pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
												{formatLogContent(log.content, log.template)}
											</pre>
										</div>
									</div>
								</div>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);

	const renderSearchTab = () => (
		<div className="space-y-6">
			{/* Search Filters */}
			<div className="bg-white rounded-lg shadow-sm border p-6">
				<h3 className="text-lg font-semibold mb-4">Search Logs</h3>

				<div className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Search in content
						</label>
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search log content..."
							className="w-full border border-gray-300 rounded-md px-3 py-2"
						/>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Resident
							</label>
							<select
								value={searchFilters.residentId}
								onChange={(e) =>
									setSearchFilters((prev) => ({
										...prev,
										residentId: e.target.value,
									}))
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2">
								<option value="">All residents</option>
								{residents.map((resident) => (
									<option key={resident.id} value={resident.id}>
										{resident.name}
									</option>
								))}
							</select>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Template
							</label>
							<select
								value={searchFilters.template}
								onChange={(e) =>
									setSearchFilters((prev) => ({
										...prev,
										template: e.target.value,
									}))
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2">
								<option value="">All templates</option>
								{templates.map((template) => (
									<option key={template.id} value={template.id}>
										{template.name}
									</option>
								))}
							</select>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								From Date
							</label>
							<input
								type="date"
								value={searchFilters.dateFrom}
								onChange={(e) =>
									setSearchFilters((prev) => ({
										...prev,
										dateFrom: e.target.value,
									}))
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2"
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								To Date
							</label>
							<input
								type="date"
								value={searchFilters.dateTo}
								onChange={(e) =>
									setSearchFilters((prev) => ({
										...prev,
										dateTo: e.target.value,
									}))
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2"
							/>
						</div>
					</div>
				</div>
			</div>

			{/* Search Results */}
			<div className="bg-white rounded-lg shadow-sm border">
				<div className="px-6 py-4 border-b border-gray-200">
					<h3 className="text-lg font-semibold">Search Results</h3>
					{searchResults && (
						<p className="text-sm text-gray-600">
							{searchResults.length} logs found
						</p>
					)}
				</div>

				<div className="divide-y divide-gray-200">
					{!searchResults || searchResults.length === 0 ? (
						<div className="p-8 text-center text-gray-500">
							<div className="text-4xl mb-4">🔍</div>
							<p className="text-lg font-medium mb-2">No results found</p>
							<p className="text-sm">Try adjusting your search criteria</p>
						</div>
					) : (
						searchResults.map((log) => (
							<div key={log.id} className="p-6">
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex items-center space-x-3 mb-2">
											<h4 className="text-lg font-medium text-gray-900">
												{log.residentName}
											</h4>
											<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
												{log.template
													?.replace(/_/g, ' ')
													.replace(/\b\w/g, (l) => l.toUpperCase()) ||
													'Unknown'}
											</span>
											<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
												{log.residentLocation}
											</span>
										</div>

										<div className="text-sm text-gray-600 mb-3">
											<div className="flex items-center space-x-4">
												<span>By: {log.authorName}</span>
												<span>Version: {log.version}</span>
												<span>
													{log.createdAt
														? new Date(log.createdAt).toLocaleString()
														: 'Unknown date'}
												</span>
											</div>
										</div>

										<div className="bg-gray-50 rounded-lg p-3">
											<pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
												{formatLogContent(log.content, log.template)}
											</pre>
										</div>
									</div>
								</div>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-bold text-gray-900">Resident Logs</h2>
					<p className="text-gray-600">Create and view resident care logs</p>
				</div>
			</div>

			{/* Tab Navigation */}
			<div className="border-b border-gray-200">
				<nav className="-mb-px flex space-x-8">
					{[
						{id: 'view', label: 'View Logs', icon: '👁️'},
						{id: 'create', label: 'Create Log', icon: '✏️'},
						{id: 'search', label: 'Search', icon: '🔍'},
					].map((tab) => (
						<button
							key={tab.id}
							onClick={() => setActiveTab(tab.id as any)}
							className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
								activeTab === tab.id
									? 'border-blue-500 text-blue-600'
									: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
							}`}>
							<span>{tab.icon}</span>
							<span>{tab.label}</span>
						</button>
					))}
				</nav>
			</div>

			{/* Tab Content */}
			{activeTab === 'create' && renderCreateTab()}
			{activeTab === 'view' && renderViewTab()}
			{activeTab === 'search' && renderSearchTab()}
		</div>
	);
}
