import React, { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function AdminAlertSchedule() {
  const config = useQuery(api.settings.getAppSettings, {});
  const setSchedule = useMutation(api.compliance.setAlertSchedule);

  const [weekday, setWeekday] = useState<number>(config?.alertWeekday ?? 1);
  const [hour, setHour] = useState<number>(config?.alertHour ?? 9);
  const [minute, setMinute] = useState<number>(config?.alertMinute ?? 0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await setSchedule({ weekday, hour, minute });
      setMsg("Schedule updated!");
    } catch (e: any) {
      setMsg(e.message || "Failed to update schedule.");
    }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSave} className="bg-white p-4 rounded shadow mb-4">
      <h3 className="font-bold mb-2">Compliance Alert Schedule</h3>
      <div className="flex gap-2 items-center mb-2">
        <label>Weekday:</label>
        <select value={weekday} onChange={e => setWeekday(Number(e.target.value))}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
            <option key={i} value={i}>{d}</option>
          ))}
        </select>
        <label>Hour:</label>
        <input type="number" min={0} max={23} value={hour} onChange={e => setHour(Number(e.target.value))} />
        <label>Minute:</label>
        <input type="number" min={0} max={59} value={minute} onChange={e => setMinute(Number(e.target.value))} />
        <button className="button ml-2" type="submit" disabled={saving}>Save</button>
      </div>
      {msg && <div className="text-green-700">{msg}</div>}
    </form>
  );
}
