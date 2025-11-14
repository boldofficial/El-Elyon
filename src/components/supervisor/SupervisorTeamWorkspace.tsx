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
