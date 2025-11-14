import React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function ComplianceAlerts() {
  const alerts = useQuery(api.compliance.listActiveAlerts) || [];
  const dismissAlert = useMutation(api.compliance.dismissAlert);

  if (!alerts.length) return null;

  return (
    <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-900 p-4 mb-4 rounded">
      <b>Compliance Alerts:</b>
      <ul>
        {alerts.map((alert: any) => (
          <li key={alert._id} className="flex items-center justify-between gap-2">
            <span>
              <b>{alert.type === "isp" ? "ISP" : "Fire Evac"} due soon</b> for <b>{alert.location}</b> (Due: {new Date(alert.dueAt).toLocaleDateString()})
            </span>
            <button
              className="button"
              onClick={() => dismissAlert({ alertId: alert._id })}
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
