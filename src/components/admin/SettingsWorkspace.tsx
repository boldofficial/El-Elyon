import React, { useState } from "react";
import KioskManagement from "./KioskManagement";
import SystemSettings from "./SystemSettings";
import SecuritySettings from "./SecuritySettings";
import ComplianceSettings from "./ComplianceSettings";

const SETTINGS_SECTIONS = [
  {
    key: "kiosks",
    title: "Kiosk Management",
    description: "Manage kiosk devices and pairing",
    icon: "📱",
    color: "bg-blue-50 border-blue-200 text-blue-700"
  },
  {
    key: "system",
    title: "System Settings",
    description: "Configure application settings",
    icon: "⚙️",
    color: "bg-gray-50 border-gray-200 text-gray-700"
  },
  {
    key: "compliance",
    title: "Compliance Settings",
    description: "Configure compliance alerts and templates",
    icon: "📋",
    color: "bg-green-50 border-green-200 text-green-700"
  },
  {
    key: "security",
    title: "Security Settings",
    description: "Manage security and access controls",
    icon: "🔒",
    color: "bg-red-50 border-red-200 text-red-700"
  }
];

export default function SettingsWorkspace() {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  if (activeSection === "kiosks") {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setActiveSection(null)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            ← Back to Settings
          </button>
          <h3 className="text-2xl font-bold text-gray-900">Kiosk Management</h3>
        </div>
        <KioskManagement />
      </div>
    );
  }

  if (activeSection === "system") {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setActiveSection(null)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            ← Back to Settings
          </button>
          <h3 className="text-2xl font-bold text-gray-900">System Settings</h3>
        </div>
        <SystemSettings />
      </div>
    );
  }

  if (activeSection === "compliance") {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setActiveSection(null)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            ← Back to Settings
          </button>
          <h3 className="text-2xl font-bold text-gray-900">Compliance Settings</h3>
        </div>
        <ComplianceSettings />
      </div>
    );
  }

  if (activeSection === "security") {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setActiveSection(null)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            ← Back to Settings
          </button>
          <h3 className="text-2xl font-bold text-gray-900">Security Settings</h3>
        </div>
        <SecuritySettings />
      </div>
    );
  }

  if (activeSection) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setActiveSection(null)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            ← Back to Settings
          </button>
          <h3 className="text-2xl font-bold text-gray-900">
            {SETTINGS_SECTIONS.find(s => s.key === activeSection)?.title}
          </h3>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
          <div className="text-4xl mb-4">
            {SETTINGS_SECTIONS.find(s => s.key === activeSection)?.icon}
          </div>
          <h4 className="text-xl font-semibold mb-2">
            {SETTINGS_SECTIONS.find(s => s.key === activeSection)?.title}
          </h4>
          <p className="text-gray-600 mb-4">
            {SETTINGS_SECTIONS.find(s => s.key === activeSection)?.description}
          </p>
          <p className="text-sm text-gray-500">
            This section will be implemented in a future update.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {SETTINGS_SECTIONS.map((section) => (
          <div
            key={section.key}
            className={section.color + " border-2 rounded-lg p-6 cursor-pointer hover:shadow-md transition-all duration-200"}
            onClick={() => setActiveSection(section.key)}
          >
            <div className="flex items-center space-x-4 mb-4">
              <div className="text-3xl">{section.icon}</div>
              <div>
                <h3 className="text-lg font-semibold">{section.title}</h3>
              </div>
            </div>
            <p className="text-sm opacity-80 mb-4">{section.description}</p>
            <div className="text-right">
              <span className="text-sm font-medium">
                {["kiosks", "system", "security", "compliance"].includes(section.key)
                  ? "Manage →"
                  : "Coming Soon →"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
