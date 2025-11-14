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
