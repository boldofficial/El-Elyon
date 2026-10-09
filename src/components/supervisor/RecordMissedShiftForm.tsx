"use client";

// Lets a supervisor or admin record a shift a worker forgot to clock in for.
// The server (src/app/api/supervisor/missed-shifts) decides who and which
// days are allowed; this form only offers what it was told it may pick.

import React, {useEffect, useMemo, useState} from "react";
import {toast} from "sonner";
import {MISSED_SHIFT_MAX_DAYS} from "@/lib/missed-shift";
import {shiftDate} from "@/lib/care-log-policy";
import {SHIFT_SLOTS, type ShiftSlot} from "@/lib/water-temperature";

const SHIFT_SLOT_LABELS: Record<ShiftSlot, string> = {
  1: "1st Shift",
  2: "2nd Shift",
  3: "3rd Shift",
};

type Options = {
  locations: string[];
  staff: {id: string; name: string; locations: string[]}[];
};

function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function RecordMissedShiftForm({
  onRecorded,
  onCancel,
}: {
  onRecorded: () => void;
  onCancel: () => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staffId, setStaffId] = useState("");
  const [location, setLocation] = useState("");
  const [shiftSlot, setShiftSlot] = useState<ShiftSlot | "">("");
  const [date, setDate] = useState(localToday());
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/supervisor/missed-shifts")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load staff");
        setOptions(body);
      })
      .catch((error) => setLoadError(error.message || "Failed to load staff"));
  }, []);

  const staffLocations = useMemo(
    () => options?.staff.find((person) => person.id === staffId)?.locations ?? [],
    [options, staffId]
  );

  // A worker assigned to one house gets it filled in.
  useEffect(() => {
    setLocation(staffLocations.length === 1 ? staffLocations[0] : "");
  }, [staffLocations]);

  const overnight = clockIn && clockOut && clockOut <= clockIn;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/supervisor/missed-shifts", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({staffId, location, shiftSlot, date, clockIn, clockOut}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to record the shift");
      toast.success("Missed shift recorded.");
      onRecorded();
    } catch (error: any) {
      toast.error(error?.message || "Failed to record the shift");
    } finally {
      setSubmitting(false);
    }
  }

  const today = localToday();

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h3 className="text-lg font-semibold mb-1">Record a missed shift</h3>
      <p className="text-sm text-gray-600 mb-4">
        For a staff member who worked but forgot to clock in. The shift will show who
        recorded it and when. Up to {MISSED_SHIFT_MAX_DAYS} days back.
      </p>

      {loadError ? (
        <p className="text-sm text-red-600">{loadError}</p>
      ) : !options ? (
        <p className="text-sm text-gray-500">Loading staff…</p>
      ) : options.staff.length === 0 ? (
        <p className="text-sm text-gray-600">There are no staff at your houses to record a shift for.</p>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="missed-shift-staff" className="block text-sm font-medium text-gray-700 mb-2">
              Staff member *
            </label>
            <select
              id="missed-shift-staff"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              required
            >
              <option value="">Choose…</option>
              {options.staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="missed-shift-location" className="block text-sm font-medium text-gray-700 mb-2">
              House *
            </label>
            <select
              id="missed-shift-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              disabled={!staffId}
              required
            >
              <option value="">Choose…</option>
              {staffLocations.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="missed-shift-slot" className="block text-sm font-medium text-gray-700 mb-2">
              Shift *
            </label>
            <select
              id="missed-shift-slot"
              value={shiftSlot}
              onChange={(e) => setShiftSlot(e.target.value ? (Number(e.target.value) as ShiftSlot) : "")}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              required
            >
              <option value="">Choose…</option>
              {SHIFT_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {SHIFT_SLOT_LABELS[slot]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="missed-shift-date" className="block text-sm font-medium text-gray-700 mb-2">
              Day the shift started *
            </label>
            <input
              id="missed-shift-date"
              type="date"
              value={date}
              min={shiftDate(today, -MISSED_SHIFT_MAX_DAYS)}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              required
            />
          </div>
          <div>
            <label htmlFor="missed-shift-in" className="block text-sm font-medium text-gray-700 mb-2">
              Clock-in time *
            </label>
            <input
              id="missed-shift-in"
              type="time"
              value={clockIn}
              onChange={(e) => setClockIn(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              required
            />
          </div>
          <div>
            <label htmlFor="missed-shift-out" className="block text-sm font-medium text-gray-700 mb-2">
              Clock-out time *
            </label>
            <input
              id="missed-shift-out"
              type="time"
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              required
            />
            {overnight && (
              <p className="mt-1 text-xs text-gray-600">Clock-out is the next morning.</p>
            )}
          </div>
          <div className="md:col-span-3 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Recording…" : "Record shift"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
