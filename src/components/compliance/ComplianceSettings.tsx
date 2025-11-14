import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

export default function ComplianceSettings() {
  // Data
  const overview = useQuery(api.compliance.getComplianceOverview) || [];

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const sendReminders = useMutation(api.compliance.sendComplianceReminders);
  const exportList = useMutation(api.compliance.exportComplianceList);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");

  // Bulk actions
  const handleSelect = (id: string) => {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    );
  };

  const handleSelectAll = (items: any[]) => {
    if (selectedIds.length === items.length) setSelectedIds([]);
    else setSelectedIds(items.map((i) => i.id));
  };

  const handleSendReminders = async () => {
    if (selectedIds.length === 0) return;
    try {
      await sendReminders({ itemIds: selectedIds });
      toast.success(`Compliance reminder emails are being sent to all admins and supervisors for ${selectedIds.length} item(s)!`);
      setSelectedIds([]);
    } catch (e: any) {
      toast.error(e.message || "Failed to send reminders");
    }
  };

  const handleExport = async () => {
    if (selectedIds.length === 0) return;
    try {
      await exportList({ itemIds: selectedIds });
      toast.success("Exported compliance list!");
      setSelectedIds([]);
    } catch (e: any) {
      toast.error(e.message || "Failed to export list");
    }
  };

  // Status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "ok":
        return "bg-green-100 text-green-800";
      case "due-soon":
        return "bg-yellow-100 text-yellow-800";
      case "overdue":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Format date
  const formatDate = (date: number) =>
    new Date(date).toLocaleDateString();

  // Filter overview items
  const filteredOverview = overview.filter((item: any) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (locationFilter !== "all" && item.location !== locationFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h3 className="text-lg font-semibold">Compliance Overview</h3>
        <p className="text-sm text-gray-600 mt-1">
          Monitor and manage compliance items across all locations
        </p>
      </div>

      {/* Compliance Items */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Compliance Items</h3>
          <div className="flex gap-2">
            <button
              onClick={() => handleSelectAll(filteredOverview)}
              className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
            >
              {selectedIds.length === filteredOverview.length ? "Unselect All" : "Select All"}
            </button>
            <button
              onClick={handleSendReminders}
              disabled={selectedIds.length === 0}
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50"
            >
              Send Reminders
            </button>
            <button
              onClick={handleExport}
              disabled={selectedIds.length === 0}
              className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm disabled:opacity-50"
            >
              Export List
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th></th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Resident</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOverview.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                    No compliance items found.
                  </td>
                </tr>
              ) : (
                filteredOverview.map((item: any) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => handleSelect(item.id)}
                      />
                    </td>
                    <td className="px-4 py-2">{item.type === "isp" ? "ISP" : "Fire Evac"}</td>
                    <td className="px-4 py-2">{item.residentName}</td>
                    <td className="px-4 py-2">{item.location}</td>
                    <td className="px-4 py-2">{item.description}</td>
                    <td className="px-4 py-2">{formatDate(item.dueDate)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                        {item.status === "ok"
                          ? "OK"
                          : item.status === "due-soon"
                          ? "Due Soon"
                          : "Overdue"}
                      </span>
                    </td>
                    <td className="px-4 py-2">{item.lastAction}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
