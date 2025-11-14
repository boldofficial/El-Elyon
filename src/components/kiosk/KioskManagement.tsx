import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { Id } from "../../convex/_generated/dataModel";

export default function KioskManagement() {
  const [showPairingForm, setShowPairingForm] = useState(false);
  const [pairingData, setPairingData] = useState<any>(null);
  const [editingKiosk, setEditingKiosk] = useState<Id<"kiosks"> | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [deletingKiosk, setDeletingKiosk] = useState<Id<"kiosks"> | null>(null);

  const kiosks = useQuery(api.kiosk.listKiosks) || [];
  const pairingTokens = useQuery(api.kiosk.listPairingTokens) || [];
  const availableLocations = useQuery(api.employees.getAvailableLocations) || [];

  const createPairing = useMutation(api.kiosk.createKioskPairing);
  const updateLabel = useMutation(api.kiosk.updateKioskLabel);
  const updateStatus = useMutation(api.kiosk.updateKioskStatus);
  const deleteKiosk = useMutation(api.kiosk.deleteKiosk);

  const [pairingForm, setPairingForm] = useState({
    location: "",
    deviceLabel: "",
  });

  const handleCreatePairing = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await createPairing({
        location: pairingForm.location,
        deviceLabel: pairingForm.deviceLabel || undefined,
      });
      setPairingData(result);
      setShowPairingForm(false);
      setPairingForm({ location: "", deviceLabel: "" });
      toast.success("Pairing token created successfully!");
    } catch (error) {
      toast.error("Failed to create pairing token");
    }
  };

  const handleUpdateLabel = async (kioskId: Id<"kiosks">) => {
    try {
      await updateLabel({
        kioskId,
        deviceLabel: newLabel || undefined,
      });
      setEditingKiosk(null);
      setNewLabel("");
      toast.success("Device label updated successfully!");
    } catch (error) {
      toast.error("Failed to update device label");
    }
  };

  const handleStatusChange = async (kioskId: Id<"kiosks">, status: "active" | "disabled" | "retired") => {
    try {
      await updateStatus({ kioskId, status });
      toast.success(`Kiosk ${status} successfully!`);
    } catch (error) {
      toast.error(`Failed to ${status} kiosk`);
    }
  };

  const handleDeleteKiosk = async (kioskId: Id<"kiosks">) => {
    try {
      await deleteKiosk({ kioskId });
      setDeletingKiosk(null);
      toast.success("Kiosk deleted successfully!");
    } catch (error) {
      toast.error("Failed to delete kiosk");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-100 text-green-800";
      case "disabled": return "bg-yellow-100 text-yellow-800";
      case "retired": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const formatLastSeen = (timestamp?: number) => {
    if (!timestamp) return "Never";
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Register/Pairing Section */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Register New Kiosk</h3>
            <p className="text-sm text-gray-600 mt-1">
              To set up a kiosk device, navigate to <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">/kiosk</code> on that device
            </p>
          </div>
          <button
            className="button"
            onClick={() => setShowPairingForm((v) => !v)}
          >
            {showPairingForm ? "Cancel" : "Create Pairing Token"}
          </button>
        </div>
        {showPairingForm && (
          <form onSubmit={handleCreatePairing} className="flex flex-col md:flex-row gap-4 items-center mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <select
                className="border rounded px-2 py-1"
                value={pairingForm.location}
                onChange={(e) => setPairingForm((f) => ({ ...f, location: e.target.value }))}
                required
              >
                <option value="">Select location</option>
                {availableLocations.map((loc: string) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Device Label (optional)</label>
              <input
                className="border rounded px-2 py-1"
                type="text"
                value={pairingForm.deviceLabel}
                onChange={(e) => setPairingForm((f) => ({ ...f, deviceLabel: e.target.value }))}
                placeholder="e.g. Front Desk"
              />
            </div>
            <button className="button mt-4 md:mt-6" type="submit">
              Generate Token
            </button>
          </form>
        )}
        {pairingData && (
          <div className="bg-blue-50 border border-blue-200 rounded p-4 mt-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg">{pairingData.token}</span>
              <button
                className="button"
                onClick={() => copyToClipboard(pairingData.token)}
              >
                Copy
              </button>
            </div>
            <div className="text-xs text-gray-600 mt-2">
              Enter this token on the kiosk device to complete registration.<br />
              <b>Location:</b> {pairingData.location}{" "}
              {pairingData.deviceLabel && (
                <>
                  | <b>Label:</b> {pairingData.deviceLabel}
                </>
              )}
              <br />
              <b>Expires:</b> {pairingData.expiresAt ? new Date(pairingData.expiresAt).toLocaleString() : "N/A"}
            </div>
          </div>
        )}
        {pairingTokens.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold mb-2 text-sm">Active Pairing Tokens</h4>
            <ul className="space-y-2">
              {pairingTokens.map((token: any) => (
                <li key={token.id} className="flex items-center gap-2">
                  <span className="font-mono">{token.token}</span>
                  <span className="text-xs text-gray-500">{token.location}{token.deviceLabel ? ' | ' + token.deviceLabel : ''}</span>
                  <span className="text-xs text-gray-400">
                    Expires: {token.expiresAt ? new Date(token.expiresAt).toLocaleString() : "N/A"}
                  </span>
                  <button
                    className="button"
                    onClick={() => copyToClipboard(token.token)}
                  >
                    Copy
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Kiosks List */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Registered Kiosks ({kiosks.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Device
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Seen
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {kiosks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No kiosks registered. Create a pairing token to add your first kiosk.
                  </td>
                </tr>
              ) : (
                kiosks.map((kiosk: any) => (
                  <tr key={kiosk.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {editingKiosk === kiosk.id ? (
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                placeholder="Device label"
                                className="border border-gray-300 rounded px-2 py-1 text-sm"
                              />
                              <button
                                onClick={() => handleUpdateLabel(kiosk.id)}
                                className="text-green-600 hover:text-green-800 text-sm"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingKiosk(null);
                                  setNewLabel("");
                                }}
                                className="text-gray-600 hover:text-gray-800 text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-2">
                              <span>{kiosk.deviceLabel || "Unlabeled Kiosk"}</span>
                              <button
                                onClick={() => {
                                  setEditingKiosk(kiosk.id);
                                  setNewLabel(kiosk.deviceLabel || "");
                                }}
                                className="text-blue-600 hover:text-blue-800 text-xs"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">{kiosk.deviceId}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{kiosk.location}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium " + getStatusColor(kiosk.status)}>
                        {kiosk.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatLastSeen(kiosk.lastSeenAt)}</div>
                      <div className="text-xs text-gray-500">
                        Registered: {kiosk.registeredAt ? new Date(kiosk.registeredAt).toLocaleDateString() : "Unknown"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {kiosk.status === "active" && (
                          <button
                            onClick={() => handleStatusChange(kiosk.id, "disabled")}
                            className="text-yellow-600 hover:text-yellow-900"
                          >
                            Disable
                          </button>
                        )}
                        {kiosk.status === "disabled" && (
                          <>
                            <button
                              onClick={() => handleStatusChange(kiosk.id, "active")}
                              className="text-green-600 hover:text-green-900"
                            >
                              Enable
                            </button>
                            <button
                              onClick={() => handleStatusChange(kiosk.id, "retired")}
                              className="text-red-600 hover:text-red-900"
                            >
                              Retire
                            </button>
                          </>
                        )}
                        {kiosk.status === "retired" && (
                          <button
                            onClick={() => setDeletingKiosk(kiosk.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deletingKiosk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md mx-auto p-6">
            <h3 className="text-lg font-semibold mb-4">Delete Kiosk</h3>
            <p className="mb-4">Are you sure you want to permanently delete this kiosk? This action cannot be undone.</p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setDeletingKiosk(null)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteKiosk(deletingKiosk)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
