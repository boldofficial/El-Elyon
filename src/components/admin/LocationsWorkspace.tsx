import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

export default function LocationsWorkspace() {
  const locations = useQuery(api.admin.listLocations) || [];
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Id<"locations"> | null>(null);
  const [deletingLocation, setDeletingLocation] = useState<Id<"locations"> | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const createLocation = useMutation(api.admin.createLocation);
  const updateLocation = useMutation(api.admin.updateLocation);
  const deleteLocation = useMutation(api.admin.deleteLocation);
  const syncLocations = useMutation(api.admin.syncLocationsFromStrings);

  const [newLocationForm, setNewLocationForm] = useState({
    name: "",
    address: "",
    capacity: "",
  });

  const [editLocationForm, setEditLocationForm] = useState({
    name: "",
    address: "",
    capacity: "",
    status: "active" as "active" | "inactive",
  });

  async function handleSyncLocations() {
    setIsSyncing(true);
    try {
      // Get all unique location names from residents, shifts, etc.
      const locationNames: string[] = [];
      await syncLocations({ locationNames });
      toast.success("Locations synced successfully!");
    } catch (error: any) {
      toast.error("Failed to sync locations: " + (error.message || "Unknown error"));
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleAddLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!newLocationForm.name.trim()) {
      toast.error("Location name is required");
      return;
    }

    try {
      await createLocation({
        name: newLocationForm.name.trim(),
        address: newLocationForm.address.trim() || undefined,
        capacity: newLocationForm.capacity ? parseInt(newLocationForm.capacity) : undefined,
      });
      setNewLocationForm({ name: "", address: "", capacity: "" });
      setShowAddForm(false);
      toast.success("Location added successfully!");
    } catch (error) {
      toast.error("Failed to add location");
    }
  }

  function handleEditLocation(location: any) {
    setEditLocationForm({
      name: location.name,
      address: location.address || "",
      capacity: location.capacity?.toString() || "",
      status: location.status,
    });
    setEditingLocation(location._id);
  }

  async function handleUpdateLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!editingLocation) return;

    try {
      await updateLocation({
        locationId: editingLocation,
        name: editLocationForm.name.trim(),
        address: editLocationForm.address.trim() || undefined,
        capacity: editLocationForm.capacity ? parseInt(editLocationForm.capacity) : undefined,
        status: editLocationForm.status,
      });
      setEditingLocation(null);
      toast.success("Location updated successfully!");
    } catch (error) {
      toast.error("Failed to update location");
    }
  }

  async function handleDeleteLocation(locationId: Id<"locations">) {
    if (!window.confirm("Are you sure you want to delete this location? This action cannot be undone.")) {
      return;
    }

    setDeletingLocation(locationId);
    try {
      await deleteLocation({ locationId });
      toast.success("Location deleted successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete location");
    } finally {
      setDeletingLocation(null);
    }
  }

  const getStatusColor = (status: string) => {
    return status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Locations ({locations.length})</h2>
        <div className="flex gap-2">
          {locations.length === 0 && (
            <button
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSyncLocations}
              disabled={isSyncing}
            >
              {isSyncing ? "Syncing..." : "🔄 Sync Existing Locations"}
            </button>
          )}
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? "Cancel" : "Add Location"}
          </button>
        </div>
      </div>

      {/* Migration Notice */}
      {locations.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-blue-800">
                No locations found in the locations table
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>
                  It looks like you have locations stored as strings in your residents, employees, and other tables, 
                  but they haven't been synced to the new locations management system yet.
                </p>
                <p className="mt-2">
                  Click the <strong>"Sync Existing Locations"</strong> button above to automatically import all 
                  existing location strings into the locations table. This will allow you to manage them centrally 
                  with addresses, capacity, and status information.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Location Form */}
      {showAddForm && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold mb-4">Add New Location</h3>
          <form onSubmit={handleAddLocation} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newLocationForm.name}
                onChange={(e) => setNewLocationForm({ ...newLocationForm, name: e.target.value })}
                placeholder="e.g., Main Building, North Wing"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
              <input
                type="text"
                value={newLocationForm.address}
                onChange={(e) => setNewLocationForm({ ...newLocationForm, address: e.target.value })}
                placeholder="e.g., 123 Main St, City, State"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Capacity</label>
              <input
                type="number"
                value={newLocationForm.capacity}
                onChange={(e) => setNewLocationForm({ ...newLocationForm, capacity: e.target.value })}
                placeholder="e.g., 50"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="1"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Add Location
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Locations List */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">All Locations</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Address
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Capacity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {locations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    <div className="text-4xl mb-2">📍</div>
                    <p className="text-lg font-medium mb-1">No locations yet</p>
                    <p className="text-sm">Sync existing locations or add your first location to get started</p>
                  </td>
                </tr>
              ) : (
                locations.map((location: any) => (
                  <tr key={location._id}>
                    {editingLocation === location._id ? (
                      <>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            value={editLocationForm.name}
                            onChange={(e) => setEditLocationForm({ ...editLocationForm, name: e.target.value })}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            value={editLocationForm.address}
                            onChange={(e) => setEditLocationForm({ ...editLocationForm, address: e.target.value })}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            value={editLocationForm.capacity}
                            onChange={(e) => setEditLocationForm({ ...editLocationForm, capacity: e.target.value })}
                            className="border border-gray-300 rounded px-2 py-1 w-24"
                            min="1"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={editLocationForm.status}
                            onChange={(e) => setEditLocationForm({ ...editLocationForm, status: e.target.value as "active" | "inactive" })}
                            className="border border-gray-300 rounded px-2 py-1"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={handleUpdateLocation}
                            className="text-blue-600 hover:text-blue-800 mr-3"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingLocation(null)}
                            className="text-gray-600 hover:text-gray-800"
                          >
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{location.name}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-500">{location.address || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{location.capacity || "—"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(location.status)}`}>
                            {location.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => handleEditLocation(location)}
                            className="text-blue-600 hover:text-blue-800 mr-3"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteLocation(location._id)}
                            disabled={deletingLocation === location._id}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            {deletingLocation === location._id ? "Deleting..." : "Delete"}
                          </button>
                        </td>
                      </>
                    )}
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