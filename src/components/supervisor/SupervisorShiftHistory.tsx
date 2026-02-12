"use client";

import React, {useEffect, useMemo, useState} from "react";

interface ShiftRecord {
  shiftId: string;
  staffId: string;
  staffName: string;
  staffEmail?: string;
  location: string;
  clockInTime?: string;
  clockOutTime?: string | null;
  durationMs: number;
  logCount: number;
  activityCount: number;
}

export default function SupervisorShiftHistory() {
  const [userRole, setUserRole] = useState<any>(null);
  const [managedLocations, setManagedLocations] = useState<string[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [selectedStaff, setSelectedStaff] = useState<string>("all");
  const [dateRange, setDateRange] = useState({from: "", to: ""});

  useEffect(() => {
    async function bootstrap() {
      try {
        const [roleRes, locationsRes, membersRes] = await Promise.all([
          fetch("/api/users/role"),
          fetch("/api/supervisor/managed-locations"),
          fetch("/api/supervisor/team-members"),
        ]);
        setUserRole(await roleRes.json());
        setManagedLocations(await locationsRes.json());
        setTeamMembers(await membersRes.json());
      } catch (error) {
        console.error("Error loading shift history context", error);
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    async function loadShifts() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (dateRange.from)
          params.append("dateFrom", new Date(dateRange.from).getTime().toString());
        if (dateRange.to)
          params.append("dateTo", new Date(dateRange.to).getTime().toString());
        if (selectedLocation !== "all") params.append("location", selectedLocation);
        if (selectedStaff !== "all") params.append("staffId", selectedStaff);
        params.append("limit", "100");

        const res = await fetch(`/api/supervisor/team-shifts?${params}`);
        const data = await res.json();
        setShifts(data);
      } catch (error) {
        console.error("Error loading shift history", error);
      } finally {
        setLoading(false);
      }
    }
    loadShifts();
  }, [dateRange, selectedLocation, selectedStaff]);

  const isAuthorized = userRole && ["admin", "supervisor"].includes(userRole.role);

  const groupedByDate = useMemo(() => {
    const map: Record<string, ShiftRecord[]> = {};
    for (const shift of shifts) {
      const day = shift.clockInTime
        ? new Date(shift.clockInTime).toLocaleDateString()
        : "Unknown date";
      if (!map[day]) map[day] = [];
      map[day].push(shift);
    }
    return map;
  }, [shifts]);

  const formatDateTime = (value?: string | null) =>
    value ? new Date(value).toLocaleString() : "—";

  const formatDurationHours = (ms: number) =>
    Math.max(0, Math.round(ms / (1000 * 60 * 60)));

  if (!isAuthorized) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🚫</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
        <p className="text-gray-600">You need supervisor or admin access to view shift history.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Shift History</h2>
          <p className="text-gray-600">
            {selectedLocation === "all" ? "All managed locations" : selectedLocation}
          </p>
        </div>
      </div>

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
              {managedLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange((prev) => ({...prev, from: e.target.value}))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange((prev) => ({...prev, to: e.target.value}))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Team Member</label>
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="all">All Team Members</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Past Shifts</h3>
          <span className="text-sm text-gray-500">Showing up to 100 shifts</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading shifts…</div>
        ) : shifts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No shifts match the current filters.</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {Object.entries(groupedByDate).map(([day, records]) => (
              <div key={day} className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-md font-semibold text-gray-900">{day}</h4>
                  <span className="text-sm text-gray-500">{records.length} shift(s)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Staff</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clock In</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clock Out</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Logs</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activities</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {records.map((shift) => (
                        <tr key={shift.shiftId}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="font-medium">{shift.staffName}</div>
                            <div className="text-gray-500 text-xs">{shift.staffEmail}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{shift.location}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatDateTime(shift.clockInTime)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{shift.clockOutTime ? formatDateTime(shift.clockOutTime) : "Still working"}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatDurationHours(shift.durationMs)}h</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{shift.logCount}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{shift.activityCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
