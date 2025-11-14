import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";
import ResidentOnboardingForm from "./ResidentOnboardingForm";
import ResidentCase from "./ResidentCase";


export default function ResidentsWorkspace() {
  const residents = useQuery(api.people.listResidents) || [];
  const userRole = useQuery(api.settings.getUserRole);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedResident, setSelectedResident] = useState<Id<"residents"> | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");

  const deleteResident = useMutation(api.people.deleteResident);

  // Get unique locations for filter
  const locations = [...new Set(residents.map(r => r.location))];

  // Filter residents
  const filteredResidents = residents.filter(resident => {
    const matchesSearch = resident.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLocation = locationFilter === "all" || resident.location === locationFilter;
    return matchesSearch && matchesLocation;
  });

  async function handleDeleteResident(residentId: Id<"residents">) {
    if (!window.confirm("Are you sure you want to delete this resident? This action cannot be undone.")) {
      return;
    }
    
    try {
      await deleteResident({ residentId });
      toast.success("Resident deleted successfully");
      if (selectedResident === residentId) {
        setSelectedResident(null);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to delete resident");
    }
  }

  const canDelete = userRole?.role === "admin";

  if (selectedResident) {
    const resident = residents.find(r => r.id === selectedResident);
    if (!resident) {
      setSelectedResident(null);
      return null;
    }

    return (
      <ResidentCase
        residentId={resident.id}
        onBack={() => setSelectedResident(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Residents ({filteredResidents.length})</h2>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? "Cancel" : "Add Resident"}
        </button>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search Residents</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Location</label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Locations</option>
              {locations.map(location => (
                <option key={location} value={location}>{location}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Add Resident Form */}
      {showAddForm && (
        <ResidentOnboardingForm onCreated={() => setShowAddForm(false)} />
      )}

      {/* Residents List */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Resident Directory</h3>
        </div>
        
        {filteredResidents.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-4">🏠</div>
            <p className="text-lg font-medium mb-2">
              {searchTerm || locationFilter !== "all" ? "No residents match your filters" : "No residents yet"}
            </p>
            <p className="text-sm">
              {searchTerm || locationFilter !== "all" ? "Try adjusting your search or filters" : "Add your first resident to get started"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredResidents.map((resident) => (
              <div key={resident.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-lg font-medium text-gray-900">{resident.name}</h4>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {resident.location}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>
                        <span className="font-medium">Date of Birth:</span> {resident.dateOfBirth}
                      </div>
                      <div>
                        <span className="font-medium">Added:</span> {resident.createdAt ? new Date(resident.createdAt).toLocaleDateString() : 'Unknown'}
                      </div>

                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end space-y-2">
                    <button
                      onClick={() => setSelectedResident(resident.id)}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                    >
                      View Details
                    </button>
                    
                    {canDelete && (
                      <button
                        onClick={() => handleDeleteResident(resident.id)}
                        className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
