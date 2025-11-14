import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

export default function CareProfileWorkspace() {
  const sessionInfo = useQuery(api.access.getSessionInfo);
  const pendingAcknowledgments = useQuery(api.care.getPendingAcknowledgments) || [];
  const acknowledgeIsp = useMutation(api.care.acknowledgeIsp);
  const [processingAck, setProcessingAck] = useState<string | null>(null);

  const handleAcknowledge = async (residentId: string, ispId: string) => {
    setProcessingAck(ispId);
    try {
      await acknowledgeIsp({
        residentId: residentId as any,
        ispId: ispId as any,
      });
      toast.success("ISP acknowledged successfully");
    } catch (error) {
      toast.error("Failed to acknowledge ISP");
    } finally {
      setProcessingAck(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">My Profile</h2>
        <p className="text-gray-600">Credentials and required acknowledgments</p>
      </div>

      {/* User Information */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold mb-4">User Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <p className="text-gray-900">{sessionInfo?.user?.name || "Not provided"}</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <p className="text-gray-900">{sessionInfo?.user?.email || "Not provided"}</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <p className="text-gray-900 capitalize">{sessionInfo?.role || "Not assigned"}</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Assigned Locations</label>
            <p className="text-gray-900">
              {sessionInfo?.locations?.length 
                ? sessionInfo.locations.join(", ") 
                : "No locations assigned"
              }
            </p>
          </div>
        </div>
      </div>

      {/* Required Acknowledgments */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Required Acknowledgments</h3>
          <p className="text-sm text-gray-600 mt-1">
            You must acknowledge these ISPs before creating logs for these residents
          </p>
        </div>
        
        {pendingAcknowledgments.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-4">✅</div>
            <p className="text-lg font-medium mb-2">All Caught Up!</p>
            <p className="text-sm">No pending ISP acknowledgments</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {pendingAcknowledgments.map((item: any) => (
              <div key={item.ispId} className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Resident {item.residentNeutralId}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        ISP Version {item.ispVersion}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-1">
                      Location: {item.location}
                    </p>
                    <p className="text-sm text-gray-600">
                      Due: {new Date(item.dueAt).toLocaleDateString()}
                    </p>
                  </div>
                  
                  <button
                    onClick={() => handleAcknowledge(item.residentId, item.ispId)}
                    disabled={processingAck === item.ispId}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {processingAck === item.ispId ? "Acknowledging..." : "Acknowledge"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Guidelines */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <h3 className="font-semibold text-blue-900 mb-3">Profile Guidelines</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Keep your contact information up to date with your supervisor</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Acknowledge ISPs promptly to ensure you can create logs</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Contact your supervisor if you need access to additional locations</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Report any issues with your account access immediately</span>
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

export default function SupervisorTeamWorkspace() {
  const userRole = useQuery(api.settings.getUserRole);
  const teamMembers = useQuery(api.teams.getTeamMembers) || [];
  const teamStats = useQuery(api.teams.getTeamLogStats, {});
  const managedLocations = useQuery(api.teams.getManagedLocations) || [];
  
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const [dateRange, setDateRange] = useState({
    from: "",
    to: "",
  });

  // Get shift summary with date filters
  const shiftSummary = useQuery(api.teams.getTeamShiftSummary, {
    dateFrom: dateRange.from ? new Date(dateRange.from).getTime() : undefined,
    dateTo: dateRange.to ? new Date(dateRange.to).getTime() : undefined,
  });

  // Get log stats with date filters
  const logStats = useQuery(api.teams.getTeamLogStats, {
    dateFrom: dateRange.from ? new Date(dateRange.from).getTime() : undefined,
    dateTo: dateRange.to ? new Date(dateRange.to).getTime() : undefined,
  });

  // Filter team members by selected location
  const filteredTeamMembers = selectedLocation === "all" 
    ? teamMembers 
    : teamMembers.filter((member: any) => 
        member.locations.includes(selectedLocation)
      );

  const isAdmin = userRole?.role === "admin";

  if (!userRole || !["admin", "supervisor"].includes(userRole.role)) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🚫</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
        <p className="text-gray-600">You need supervisor or admin access to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Team Management</h2>
          <p className="text-gray-600">
            {isAdmin ? "All locations" : `Managing: ${managedLocations.join(", ")}`}
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.196-2.121M9 20H4v-2a3 3 0 015.196-2.121m0 0a5.002 5.002 0 019.608 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Team Members</p>
              <p className="text-2xl font-semibold text-gray-900">{teamMembers.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Currently Working</p>
              <p className="text-2xl font-semibold text-gray-900">
                {shiftSummary?.filter((s: any) => s.isCurrentlyWorking).length || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Logs</p>
              <p className="text-2xl font-semibold text-gray-900">{logStats?.totalLogs || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Locations</p>
              <p className="text-2xl font-semibold text-gray-900">{managedLocations.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="all">All Locations</option>
              {managedLocations.map((location: string) => (
                <option key={location} value={location}>{location}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Team Member</label>
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">All team members</option>
              {teamMembers.map((member: any) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Team Members */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Team Members ({filteredTeamMembers.length})</h3>
        </div>
        
        {filteredTeamMembers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-4">👥</div>
            <p className="text-lg font-medium mb-2">No team members</p>
            <p className="text-sm">
              {selectedLocation !== "all" 
                ? "No team members in the selected location" 
                : "No team members found"
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredTeamMembers.map((member: any) => {
              const memberShift = shiftSummary?.find((s: any) => s.staffId === member.id);
              const memberLogCount = logStats?.logsByAuthor?.[member.name] || 0;
              
              return (
                <div key={member.id} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-semibold">
                            {member.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h4 className="text-lg font-medium text-gray-900">{member.name}</h4>
                          <p className="text-sm text-gray-600">{member.email}</p>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          member.role === "admin" ? "bg-red-100 text-red-800" :
                          member.role === "supervisor" ? "bg-blue-100 text-blue-800" :
                          "bg-green-100 text-green-800"
                        }`}>
                          {member.role}
                        </span>
                        {memberShift?.isCurrentlyWorking && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Currently Working
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">Locations:</span>
                          <span>{member.locations.join(", ")}</span>
                        </div>
                        {memberShift?.isCurrentlyWorking && (
                          <div className="flex items-center space-x-2">
                            <span className="font-medium">Current Location:</span>
                            <span className="text-green-600">{memberShift.location}</span>
                          </div>
                        )}
                        <div className="flex items-center space-x-4 mt-2">
                          <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {Math.round((memberShift?.duration || 0) / (1000 * 60 * 60))}h this period
                          </span>
                          <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {memberLogCount} logs
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Log Statistics */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Log Statistics</h3>
        </div>
        
        <div className="divide-y divide-gray-200">
          {!logStats || logStats.totalLogs === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <div className="text-4xl mb-4">📝</div>
              <p className="text-lg font-medium mb-2">No log data</p>
              <p className="text-sm">No logs created for this period</p>
            </div>
          ) : (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-blue-600">Total Logs</p>
                  <p className="text-2xl font-bold text-blue-900">{logStats.totalLogs}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-green-600">Templates Used</p>
                  <p className="text-2xl font-bold text-green-900">{Object.keys(logStats.logsByTemplate).length}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-purple-600">Active Authors</p>
                  <p className="text-2xl font-bold text-purple-900">{Object.keys(logStats.logsByAuthor).length}</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Logs by Author</h4>
                  <div className="space-y-2">
                    {Object.entries(logStats.logsByAuthor).map(([author, count]) => (
                      <div key={author} className="flex justify-between items-center">
                        <span className="text-sm text-gray-700">{author}</span>
                        <span className="text-sm font-medium text-gray-900">{count as number}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Logs by Template</h4>
                  <div className="space-y-2">
                    {Object.entries(logStats.logsByTemplate).map(([template, count]) => (
                      <div key={template} className="flex justify-between items-center">
                        <span className="text-sm text-gray-700">{template.replace(/_/g, " ")}</span>
                        <span className="text-sm font-medium text-gray-900">{count as number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/////
import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import ResidentCase from "./ResidentCase";

export default function SupervisorComplianceWorkspace() {
  const [activeTab, setActiveTab] = useState("residents");
  const [selectedResident, setSelectedResident] = useState<Id<"residents"> | null>(null);

  const residents = useQuery(api.care.getMyResidents) || [];
  const ispAcknowledgments = useQuery(api.supervisor.getIspAcknowledgments) || [];

  const renderResidentsList = () => {
    if (selectedResident) {
      return (
        <div className="space-y-4">
          <button onClick={() => setSelectedResident(null)} className="flex items-center text-purple-600 hover:text-purple-700 mb-4">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Residents List
          </button>
          <ResidentCase residentId={selectedResident} onBack={() => setSelectedResident(null)} />
        </div>
      );
    }
    
    return (
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Select Resident to Manage</h3>
        </div>
        {residents.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-4">🏠</div>
            <p className="text-lg font-medium mb-2">No Residents Found</p>
            <p className="text-sm">No residents in your assigned locations</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {residents.map((resident: any) => (
              <button
                key={resident.id}
                onClick={() => setSelectedResident(resident.id)}
                className="w-full p-6 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">{resident.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">Location: {resident.location}</p>
                    {resident.dob && (
                      <p className="text-sm text-gray-500 mt-1">DOB: {resident.dob}</p>
                    )}
                  </div>
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderAcknowledgments = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">ISP Acknowledgment Status</h3>
        </div>
        
        {ispAcknowledgments.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-lg font-medium mb-2">No Published ISPs</p>
            <p className="text-sm">Publish ISPs to track acknowledgments</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {ispAcknowledgments.map((item: any) => (
              <div key={`${item.ispId}-${item.userId || 'unassigned'}`} className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Resident {item.residentNeutralId}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        ISP v{item.ispVersion}
                      </span>
                      {item.userName && (
                        <span className="text-sm font-medium text-gray-900">
                          {item.userName}
                        </span>
                      )}
                    </div>
                    
                    <div className="text-sm text-gray-600">
                      <p>Location: {item.location}</p>
                      {item.acknowledgedAt ? (
                        <p className="text-green-600">
                          ✓ Acknowledged: {new Date(item.acknowledgedAt).toLocaleString()}
                        </p>
                      ) : (
                        <p className="text-yellow-600">⚠ Pending acknowledgment</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      item.acknowledgedAt ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                    }`}>
                      {item.acknowledgedAt ? "Acknowledged" : "Pending"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Compliance Management</h2>
        <p className="text-gray-600">View residents and track ISP acknowledgments</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("residents")}
            className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
              activeTab === "residents"
                ? "border-purple-500 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Residents
          </button>
          <button
            onClick={() => setActiveTab("acknowledgments")}
            className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
              activeTab === "acknowledgments"
                ? "border-purple-500 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Acknowledgment Status
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "residents" && renderResidentsList()}
      {activeTab === "acknowledgments" && renderAcknowledgments()}
    </div>
  );
}

