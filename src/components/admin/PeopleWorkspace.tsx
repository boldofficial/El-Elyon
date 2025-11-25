import React, { useState } from "react";
import ResidentsWorkspace from "../care/ResidentsWorkspace";
import GuardiansWorkspace from "../guardian/GuardiansWorkspace";
import EmployeeWorkspace from "./EmployeeWorkspace";

export default function PeopleWorkspace() {
  const [activeTab, setActiveTab] = useState("residents");

  const tabs = [
    { id: "residents", label: "Residents", icon: "🏠" },
    { id: "guardians", label: "Guardians", icon: "👨‍👩‍👧‍👦" },
    { id: "employees", label: "Employees", icon: "👥" },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "residents":
        return <ResidentsWorkspace />;
      case "guardians":
        return <GuardiansWorkspace />;
      case "employees":
        return <EmployeeWorkspace />;
      default:
        return <ResidentsWorkspace />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center space-x-2 ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {renderContent()}
    </div>
  );
}
