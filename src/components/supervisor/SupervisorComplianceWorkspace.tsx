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
