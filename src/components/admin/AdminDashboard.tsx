import React from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

interface AdminDashboardProps {
  onNavigate: (view: string) => void;
}

export default function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const employees = useQuery(api.employees.listEmployees) || [];
  const residents = useQuery(api.people.listResidents) || [];
  const guardians = useQuery(api.people.listGuardians) || [];
  const recentLogs = useQuery(api.admin.getRecentLogsForAdmin, { limit: 10 }) || [];

  const stats = [
    {
      title: "Total Employees",
      value: employees.length,
      icon: "👥",
      color: "bg-blue-50 text-blue-700 border-blue-200"
    },
    {
      title: "Total Residents",
      value: residents.length,
      icon: "🏠",
      color: "bg-green-50 text-green-700 border-green-200"
    },
    {
      title: "Total Guardians",
      value: guardians.length,
      icon: "👨‍👩‍👧‍👦",
      color: "bg-purple-50 text-purple-700 border-purple-200"
    },
    {
      title: "Pending Invites",
      value: employees.filter(emp => !emp.hasAcceptedInvite).length,
      icon: "📧",
      color: "bg-yellow-50 text-yellow-700 border-yellow-200"
    },
    {
      title: "Active Locations",
      value: new Set([...employees.flatMap(emp => emp.locations), ...residents.map(res => res.location)]).size,
      icon: "📍",
      color: "bg-indigo-50 text-indigo-700 border-indigo-200"
    }
  ];

  const recentEmployees = employees
    .filter(emp => emp.invitedAt)
    .sort((a, b) => (b.invitedAt || 0) - (a.invitedAt || 0))
    .slice(0, 5);

  const recentResidents = residents
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 5);

  const recentGuardians = guardians
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 3);

  const formatLogContent = (content: string, template: string) => {
    try {
      const parsed = JSON.parse(content);
      if (template === "daily_notes") {
        return `Mood: ${parsed.mood || "N/A"}, Activities: ${parsed.activities || "N/A"}`;
      } else if (template === "incident_report") {
        return `${parsed.incident_type || "Incident"}: ${parsed.description || "No description"}`;
      } else if (template === "medication_log") {
        return `${parsed.medication || "Medication"} - ${parsed.dosage || "N/A"}`;
      }
      return content.substring(0, 100) + (content.length > 100 ? "..." : "");
    } catch {
      return content.substring(0, 100) + (content.length > 100 ? "..." : "");
    }
  };

  const getTemplateIcon = (template: string) => {
    switch (template) {
      case "daily_notes": return "📝";
      case "incident_report": return "⚠️";
      case "medication_log": return "💊";
      case "care_plan_update": return "📋";
      default: return "📄";
    }
  };

  const getTemplateColor = (template: string) => {
    switch (template) {
      case "daily_notes": return "bg-blue-100 text-blue-800";
      case "incident_report": return "bg-red-100 text-red-800";
      case "medication_log": return "bg-green-100 text-green-800";
      case "care_plan_update": return "bg-purple-100 text-purple-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {stats.map((stat, index) => (
          <div key={index} className={`${stat.color} border-2 rounded-lg p-6`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-80">{stat.title}</p>
                <p className="text-3xl font-bold mt-2">{stat.value}</p>
              </div>
              <div className="text-3xl">{stat.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Employee Invites */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Recent Employee Invites</h3>
          </div>
          <div className="p-6">
            {recentEmployees.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No recent employee invites</p>
            ) : (
              <div className="space-y-4">
                {recentEmployees.map((employee) => (
                  <div key={employee.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{employee.name}</p>
                      <p className="text-sm text-gray-500">{employee.workEmail}</p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        employee.hasAcceptedInvite 
                          ? "bg-green-100 text-green-800" 
                          : "bg-yellow-100 text-yellow-800"
                      }`}>
                        {employee.hasAcceptedInvite ? "Accepted" : "Pending"}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">
                        {employee.invitedAt ? new Date(employee.invitedAt).toLocaleDateString() : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity Logs */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Recent Care Logs</h3>
          </div>
          <div className="p-6">
            {recentLogs.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No recent care logs</p>
            ) : (
              <div className="space-y-4">
                {recentLogs.slice(0, 5).map((log) => (
                  <div key={log._id} className="border-l-4 border-blue-200 pl-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{getTemplateIcon(log.template || "")}</span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getTemplateColor(log.template || "")}`}>
                            {log.template?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || "Unknown"}
                          </span>
                        </div>
                        <p className="font-medium text-sm">Resident Log</p>
                        <p className="text-xs text-gray-600 mb-2">{log.location || "Unknown"}</p>
                        <p className="text-sm text-gray-700">
                          {formatLogContent(log.content, log.template || "")}
                        </p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-xs text-gray-500">
                          Staff
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(log.createdAt || log._creationTime).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Residents */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Recent Residents</h3>
          </div>
          <div className="p-6">
            {recentResidents.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No residents added yet</p>
            ) : (
              <div className="space-y-4">
                {recentResidents.map((resident) => (
                  <div key={resident.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{resident.name}</p>
                      <p className="text-sm text-gray-500">{resident.location}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900">
                        {resident.createdAt ? new Date(resident.createdAt).toLocaleDateString() : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Guardians */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Recent Guardians</h3>
          </div>
          <div className="p-6">
            {recentGuardians.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No guardians added yet</p>
            ) : (
              <div className="space-y-4">
                {recentGuardians.map((guardian) => (
                  <div key={guardian.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{guardian.name}</p>
                      <p className="text-sm text-gray-500">
                        {guardian.residentIds && guardian.residentIds.length > 0 
                          ? `${guardian.residentIds.length} resident(s)`
                          : "No residents assigned"
                        }
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900">
                        {guardian.createdAt ? new Date(guardian.createdAt).toLocaleDateString() : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button 
            onClick={() => onNavigate("people")}
            className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <div className="text-2xl mb-2">👥</div>
            <p className="font-medium">Add Employee</p>
            <p className="text-sm text-gray-500">Invite new team member</p>
          </button>
          <button 
            onClick={() => onNavigate("people")}
            className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-400 hover:bg-green-50 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          >
            <div className="text-2xl mb-2">🏠</div>
            <p className="font-medium">Add Resident</p>
            <p className="text-sm text-gray-500">Register new resident</p>
          </button>
          <button 
            onClick={() => onNavigate("people")}
            className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          >
            <div className="text-2xl mb-2">👨‍👩‍👧‍👦</div>
            <p className="font-medium">Add Guardian</p>
            <p className="text-sm text-gray-500">Register guardian contact</p>
          </button>
          <button 
            onClick={() => onNavigate("settings")}
            className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <div className="text-2xl mb-2">⚙️</div>
            <p className="font-medium">System Settings</p>
            <p className="text-sm text-gray-500">Configure application</p>
          </button>
        </div>
      </div>
    </div>
  );
}
