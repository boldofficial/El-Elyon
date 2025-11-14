import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

export default function SystemSettings() {
  const appSettings = useQuery(api.settings.getAppSettings);
  const updateSettings = useMutation(api.settings.updateAppSettings);

  const [settings, setSettings] = useState({
    complianceReminderTemplate: "",
    guardianInviteTemplate: "",
    alertWeekday: 1,
    alertHour: 9,
    alertMinute: 0,
    selfieEnforced: false,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Update local state when data loads
  useEffect(() => {
    if (appSettings) {
      setSettings(appSettings);
    }
  }, [appSettings]);

  // Track changes
  useEffect(() => {
    if (appSettings) {
      const hasChanged = Object.keys(settings).some(
        key => settings[key as keyof typeof settings] !== appSettings[key as keyof typeof appSettings]
      );
      setHasChanges(hasChanged);
    }
  }, [settings, appSettings]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await updateSettings(settings);
      toast.success("Settings updated successfully!");
      setHasChanges(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (appSettings) {
      setSettings(appSettings);
      setHasChanges(false);
    }
  };

  const weekdays = [
    { value: 0, label: "Sunday" },
    { value: 1, label: "Monday" },
    { value: 2, label: "Tuesday" },
    { value: 3, label: "Wednesday" },
    { value: 4, label: "Thursday" },
    { value: 5, label: "Friday" },
    { value: 6, label: "Saturday" },
  ];

  const hours = Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: i.toString().padStart(2, '0') + ":00"
  }));

  const minutes = Array.from({ length: 60 }, (_, i) => ({
    value: i,
    label: i.toString().padStart(2, '0')
  }));

  if (!appSettings) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Email Templates Section */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Email Templates</h3>
          <p className="text-sm text-gray-600">
            Configure email templates for automated notifications and invitations.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Compliance Reminder Template
            </label>
            <textarea
              value={settings.complianceReminderTemplate}
              onChange={(e) => setSettings({ ...settings, complianceReminderTemplate: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 h-32"
              placeholder="Enter the email template for compliance reminders..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Use variables like {"{resident_name}"}, {"{location}"}, {"{due_date}"} for dynamic content.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Guardian Invite Template
            </label>
            <textarea
              value={settings.guardianInviteTemplate}
              onChange={(e) => setSettings({ ...settings, guardianInviteTemplate: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 h-32"
              placeholder="Enter the email template for guardian invitations..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Use variables like {"{guardian_name}"}, {"{resident_name}"}, {"{invite_link}"} for dynamic content.
            </p>
          </div>
        </div>
      </div>

      {/* Alert Scheduling Section */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Alert Scheduling</h3>
          <p className="text-sm text-gray-600">
            Configure when automated compliance alerts are sent to staff and guardians.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Day of Week
            </label>
            <select
              value={settings.alertWeekday}
              onChange={(e) => setSettings({ ...settings, alertWeekday: parseInt(e.target.value) })}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              {weekdays.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hour
            </label>
            <select
              value={settings.alertHour}
              onChange={(e) => setSettings({ ...settings, alertHour: parseInt(e.target.value) })}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              {hours.map((hour) => (
                <option key={hour.value} value={hour.value}>
                  {hour.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minute
            </label>
            <select
              value={settings.alertMinute}
              onChange={(e) => setSettings({ ...settings, alertMinute: parseInt(e.target.value) })}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              {minutes.filter((_, i) => i % 5 === 0).map((minute) => (
                <option key={minute.value} value={minute.value}>
                  {minute.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-700">
            <strong>Current Schedule:</strong> Alerts will be sent every{" "}
            {weekdays.find(d => d.value === settings.alertWeekday)?.label} at{" "}
            {settings.alertHour.toString().padStart(2, '0')}:
            {settings.alertMinute.toString().padStart(2, '0')}
          </p>
        </div>
      </div>

      {/* Security & Access Section */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Security & Access</h3>
          <p className="text-sm text-gray-600">
            Configure security policies and access controls for the application.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-md">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Selfie Verification</h4>
              <p className="text-sm text-gray-600">
                Require staff to take a selfie when clocking in/out for identity verification.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.selfieEnforced}
                onChange={(e) => setSettings({ ...settings, selfieEnforced: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between bg-white rounded-lg shadow-sm border p-6">
        <div className="text-sm text-gray-600">
          {hasChanges ? (
            <span className="text-amber-600 font-medium">You have unsaved changes</span>
          ) : (
            <span>All changes saved</span>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            disabled={!hasChanges || isLoading}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
