import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function CareLogsWorkspace() {
  const [activeTab, setActiveTab] = useState<"create" | "view" | "search">("view");
  const [selectedResident, setSelectedResident] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [logContent, setLogContent] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilters, setSearchFilters] = useState({
    residentId: "",
    template: "",
    dateFrom: "",
    dateTo: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper function to format dates safely
  const formatDate = (timestamp: number | undefined) => {
    if (!timestamp) return 'Unknown date';
    return new Date(timestamp).toLocaleString();
  };

  const residents = useQuery(api.care.getMyResidents) || [];
  const templates = useQuery(api.care.getLogTemplates) || [];
  const recentLogs = useQuery(api.care.getResidentLogs, { limit: 20 });
  const logsSummary = useQuery(api.care.getRecentLogsSummary);
  const createLog = useMutation(api.care.createResidentLog);
  
  // Search logs when filters change
  const searchResults = useQuery(api.care.searchLogs, 
    searchQuery.trim() || Object.values(searchFilters).some(v => v) ? {
      query: searchQuery,
      residentId: searchFilters.residentId ? (searchFilters.residentId as any) : undefined,
      template: searchFilters.template || undefined,
      dateFrom: searchFilters.dateFrom ? new Date(searchFilters.dateFrom).getTime() : undefined,
      dateTo: searchFilters.dateTo ? new Date(searchFilters.dateTo).getTime() : undefined,
      limit: 50,
    } : "skip"
  );

  const selectedTemplateData = templates.find(t => t.id === selectedTemplate);

  const handleFieldChange = (fieldName: string, value: string) => {
    setLogContent(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const handleSubmitLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResident || !selectedTemplate) return;

    setIsSubmitting(true);
    try {
      const content = JSON.stringify(logContent);
      await createLog({
        residentId: selectedResident as any,
        template: selectedTemplate,
        content,
      });
      
      // Reset form
      setLogContent({});
      setSelectedResident("");
      setSelectedTemplate("");
      alert("Log created successfully!");
    } catch (error) {
      alert("Error creating log: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatLogContent = (content: string, template: string | undefined) => {
    try {
      const parsed = JSON.parse(content);
      const templateData = templates.find(t => t.id === template);
      
      if (!templateData) return content;
      
      return templateData.fields.map(field => {
        const value = parsed[field.name] || "Not specified";
        return `${field.label}: ${value}`;
      }).join("\n");
    } catch {
      return content;
    }
  };

  const renderCreateTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold mb-4">Create New Log Entry</h3>
        
        <form onSubmit={handleSubmitLog} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Resident *
              </label>
              <select
                value={selectedResident}
                onChange={(e) => setSelectedResident(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                required
                disabled={isSubmitting}
              >
                <option value="">Choose a resident...</option>
                {residents.map((resident) => (
                  <option key={resident.id} value={resident.id}>
                    {resident.name} ({resident.location})
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Log Template *
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => {
                  setSelectedTemplate(e.target.value);
                  setLogContent({});
                }}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                required
                disabled={isSubmitting}
              >
                <option value="">Choose a template...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedTemplateData && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900">{selectedTemplateData.name}</h4>
              <p className="text-sm text-gray-600">{selectedTemplateData.description}</p>
              
              {selectedTemplateData.fields.map((field) => (
                <div key={field.name}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                  </label>
                  
                  {field.type === "textarea" ? (
                    <textarea
                      value={logContent[field.name] || ""}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                      rows={3}
                      disabled={isSubmitting}
                    />
                  ) : field.type === "select" ? (
                    <select
                      value={logContent[field.name] || ""}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                      disabled={isSubmitting}
                    >
                      <option value="">Select...</option>
                      {field.options?.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      value={logContent[field.name] || ""}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                      disabled={isSubmitting}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!selectedResident || !selectedTemplate || isSubmitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : "Create Log Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderViewTab = () => (
    <div className="space-y-6">
      {/* Summary Cards */}
      {logsSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Total Logs (7 days)</p>
                <p className="text-xl font-semibold text-gray-900">{logsSummary.totalLogs}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">My Logs</p>
                <p className="text-xl font-semibold text-gray-900">{logsSummary.myLogs}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Locations</p>
                <p className="text-xl font-semibold text-gray-900">
                  {Object.keys(logsSummary.logsByLocation).length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Templates Used</p>
                <p className="text-xl font-semibold text-gray-900">
                  {Object.keys(logsSummary.logsByTemplate).length}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Logs */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Recent Log Entries</h3>
          <p className="text-sm text-gray-600">All logs from your accessible locations</p>
        </div>
        
        <div className="divide-y divide-gray-200">
          {!recentLogs || recentLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <div className="text-4xl mb-4">📝</div>
              <p className="text-lg font-medium mb-2">No logs found</p>
              <p className="text-sm">Log entries will appear here once created</p>
            </div>
          ) : (
            recentLogs.map((log) => (
              <div key={log.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-lg font-medium text-gray-900">
                        {log.residentName}
                      </h4>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {log.template?.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) || "Unknown"}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {log.residentLocation}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600 mb-3">
                      <div className="flex items-center space-x-4">
                        <span>By: {log.authorName}</span>
                        <span>Version: {log.version}</span>
                        <span>{log.createdAt ? new Date(log.createdAt).toLocaleString() : 'Unknown date'}</span>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 rounded-lg p-3">
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                        {formatLogContent(log.content, log.template)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderSearchTab = () => (
    <div className="space-y-6">
      {/* Search Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold mb-4">Search Logs</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search in content
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search log content..."
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Resident
              </label>
              <select
                value={searchFilters.residentId}
                onChange={(e) => setSearchFilters(prev => ({ ...prev, residentId: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All residents</option>
                {residents.map((resident) => (
                  <option key={resident.id} value={resident.id}>
                    {resident.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Template
              </label>
              <select
                value={searchFilters.template}
                onChange={(e) => setSearchFilters(prev => ({ ...prev, template: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All templates</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                From Date
              </label>
              <input
                type="date"
                value={searchFilters.dateFrom}
                onChange={(e) => setSearchFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                To Date
              </label>
              <input
                type="date"
                value={searchFilters.dateTo}
                onChange={(e) => setSearchFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Search Results */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Search Results</h3>
          {searchResults && (
            <p className="text-sm text-gray-600">{searchResults.length} logs found</p>
          )}
        </div>
        
        <div className="divide-y divide-gray-200">
          {!searchResults || searchResults.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <div className="text-4xl mb-4">🔍</div>
              <p className="text-lg font-medium mb-2">No results found</p>
              <p className="text-sm">Try adjusting your search criteria</p>
            </div>
          ) : (
            searchResults.map((log) => (
              <div key={log.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-lg font-medium text-gray-900">
                        {log.residentName}
                      </h4>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {log.template?.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) || "Unknown"}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {log.residentLocation}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600 mb-3">
                      <div className="flex items-center space-x-4">
                        <span>By: {log.authorName}</span>
                        <span>Version: {log.version}</span>
                        <span>{log.createdAt ? new Date(log.createdAt).toLocaleString() : 'Unknown date'}</span>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 rounded-lg p-3">
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                        {formatLogContent(log.content, log.template)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Resident Logs</h2>
          <p className="text-gray-600">Create and view resident care logs</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: "view", label: "View Logs", icon: "👁️" },
            { id: "create", label: "Create Log", icon: "✏️" },
            { id: "search", label: "Search", icon: "🔍" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
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
      {activeTab === "create" && renderCreateTab()}
      {activeTab === "view" && renderViewTab()}
      {activeTab === "search" && renderSearchTab()}
    </div>
  );
}
