/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-misused-promises */
import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";
import ISPWorkspace from "./ISPWorkspace";
import FireEvacManagement from "./FireEvacManagement";

type StatusType = "ok" | "due-soon" | "overdue";

const STATUS_COLORS: Record<StatusType, string> = {
  ok: "text-green-600 bg-green-50",
  "due-soon": "text-orange-600 bg-orange-50",
  overdue: "text-red-600 bg-red-50",
};

const STATUS_ORDER: Record<StatusType, number> = { overdue: 0, "due-soon": 1, ok: 2 };

export default function ComplianceWorkspace() {
  const [filters, setFilters] = useState({
    location: "",
    itemType: "",
    status: "",
  });
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showISPWorkspace, setShowISPWorkspace] = useState<{
    residentId: Id<"residents">;
    residentName: string;
  } | null>(null);
  const [showFireEvacManagement, setShowFireEvacManagement] = useState<{
    residentId: Id<"residents">;
    residentName: string;
  } | null>(null);
  
  const userRole = useQuery(api.settings.getUserRole);
  const complianceData = useQuery(api.compliance.getComplianceOverview) || [];

  const sendReminders = useMutation(api.compliance.sendComplianceReminders);
  const exportList = useMutation(api.compliance.exportComplianceList);

  // Get unique locations for filter - only show locations user has access to
  const locations = useMemo(() => {
    const allLocations = complianceData.map(item => item.location);
    const uniqueLocations = [...new Set(allLocations)].sort();
    
    // If user is not admin, filter to only their assigned locations
    if (userRole && userRole.role !== "admin" && userRole.locations) {
      return uniqueLocations.filter(loc => userRole.locations?.includes(loc));
    }
    
    return uniqueLocations;
  }, [complianceData, userRole]);

  const handleBulkAction = async (action: string) => {
    if (selectedItems.length === 0) return;
    try {
      if (action === "send-reminders") {
        await sendReminders({ itemIds: selectedItems });
        toast.success(`Reminders sent for ${selectedItems.length} items`);
      } else if (action === "export") {
        await exportList({ itemIds: selectedItems });
        toast.success(`Exported ${selectedItems.length} items`);
      }
      setSelectedItems([]);
    } catch (error) {
      console.error("Bulk action failed:", error);
      toast.error("Action failed. Please try again.");
    }
  };

  const filteredComplianceData = useMemo(() => {
    return complianceData.filter(item => {
      if (filters.location && item.location !== filters.location) return false;
      if (filters.itemType && item.type !== filters.itemType) return false;
      if (filters.status && item.status !== filters.status) return false;
      return true;
    }).sort((a, b) => STATUS_ORDER[a.status as StatusType] - STATUS_ORDER[b.status as StatusType]);
  }, [complianceData, filters]);

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <select
              value={filters.location}
              onChange={(e) => setFilters({ ...filters, location: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Locations</option>
              {locations.map(location => (
                <option key={location} value={location}>{location}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Item Type
            </label>
            <select
              value={filters.itemType}
              onChange={(e) => setFilters({ ...filters, itemType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              <option value="isp">ISP</option>
              <option value="fire_evac">Fire Evac Plan</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="overdue">Overdue</option>
              <option value="due-soon">Due Soon</option>
              <option value="ok">OK</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setFilters({ location: "", itemType: "", status: "" })}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedItems.length > 0 && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-700">
              {selectedItems.length} items selected
            </span>
            <div className="space-x-2">
              <button
                onClick={() => handleBulkAction("send-reminders")}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Send Reminders
              </button>
              <button
                onClick={() => handleBulkAction("export")}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              >
                Export List
              </button>
              <button
                onClick={() => setSelectedItems([])}
                className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compliance Items Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Compliance Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedItems.length === filteredComplianceData.length && filteredComplianceData.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItems(filteredComplianceData.map(item => item.id));
                      } else {
                        setSelectedItems([]);
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Due Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredComplianceData.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedItems([...selectedItems, item.id]);
                        } else {
                          setSelectedItems(selectedItems.filter(id => id !== item.id));
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{item.itemName}</div>
                      <div className="text-sm text-gray-500">{item.description}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.location}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_COLORS[item.status as StatusType]}`}>
                      {item.status === "due-soon" ? "Due Soon" : item.status === "overdue" ? "Overdue" : "OK"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(item.dueDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {item.lastAction}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {item.type === "isp" && item.residentId && (
                      <button
                        onClick={() => setShowISPWorkspace({
                          residentId: item.residentId as Id<"residents">,
                          residentName: item.residentName || "Unknown Resident"
                        })}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Manage ISP
                      </button>
                    )}
                    {item.type === "fire_evac" && item.residentId && (
                      <button
                        onClick={() => setShowFireEvacManagement({
                          residentId: item.residentId as Id<"residents">,
                          residentName: item.residentName || "Unknown Resident"
                        })}
                        className="text-green-600 hover:text-green-900"
                      >
                        Manage Fire Evac
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredComplianceData.length === 0 && (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">📋</div>
              <p className="text-gray-500 text-lg font-medium mb-2">
                No compliance items found
              </p>
              <p className="text-gray-400 text-sm">
                {complianceData.length === 0 
                  ? userRole?.role === "admin" 
                    ? "No compliance items exist yet. Add residents and ISPs to get started."
                    : "No compliance items for your assigned locations yet."
                  : "Try adjusting your filters to see more items."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Compliance Overview</h2>
          <p className="text-gray-600">Monitor compliance status for ISPs, fire evacuation, and more</p>
          {userRole && userRole.locations && userRole.locations.length > 0 && userRole.role !== "admin" && (
            <p className="text-sm text-blue-600 mt-1">
              📍 Viewing: {userRole.locations.join(", ")}
            </p>
          )}
        </div>
      </div>
      {renderOverview()}

      {/* ISP Workspace Modal */}
      {showISPWorkspace && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <ISPWorkspace
              residentId={showISPWorkspace.residentId}
              residentName={showISPWorkspace.residentName}
              onClose={() => setShowISPWorkspace(null)}
            />
          </div>
        </div>
      )}

      {showFireEvacManagement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <FireEvacManagement
              residentId={showFireEvacManagement.residentId}
              residentName={showFireEvacManagement.residentName}
              onClose={() => setShowFireEvacManagement(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}