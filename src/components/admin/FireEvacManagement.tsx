import React, { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

// Define interfaces for data structures
interface FireEvacPlan {
  id: string; // Changed from _id to id to match schema
  residentId: string;
  fileStorageId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  mobilityNeeds?: string;
  assistanceRequired?: string;
  medicalEquipment?: string;
  specialInstructions?: string;
  notes?: string;
  createdAt: number; // Will map from created_at in backend response
  dueDate: number; // Calculated on backend or frontend
  status: string; // e.g., "ok", "due-soon", "overdue"
  daysUntilDue: number; // Calculated or from backend
  version: number;
}

type Props = {
  residentId: string;
  residentName: string;
  onClose?: () => void;
};

export default function FireEvacManagement({ residentId, residentName, onClose }: Props) {
  const [fireEvacPlans, setFireEvacPlans] = useState<FireEvacPlan[]>([]);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadingPlans, setLoadingPlans] = useState(true);
  
  const [formData, setFormData] = useState({
    mobilityNeeds: "",
    assistanceRequired: "",
    medicalEquipment: "",
    specialInstructions: "",
    notes: "",
  });

  const fetchFireEvacPlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const res = await fetch(`/api/care/fire-evac-plans?residentId=${residentId}`);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      // The API returns the plans directly
      const data = await res.json();
      
      // Calculate derived fields that might not be in the raw DB response if looking at raw table
      // But let's assume the API might need some enrichment or we calculate here.
      // Based on previous code, let's enrich client side if needed, or trust API.
      // The API listFireEvacPlans returns raw DB records. We need to calculate status/dueDate.
      
      const enrichedData = data.map((plan: any) => {
          const createdAt = new Date(plan.createdAt || Date.now()).getTime();
          const dueDate = createdAt + 365 * 24 * 60 * 60 * 1000;
          const now = Date.now();
          const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
          
          let status = 'ok';
          if (daysUntilDue < 0) status = 'overdue';
          else if (daysUntilDue <= 30) status = 'due-soon';

          return {
              ...plan,
              dueDate,
              daysUntilDue,
              status
          };
      });

      setFireEvacPlans(enrichedData);
    } catch (error: any) {
      console.error("Error fetching fire evac plans:", error);
      toast.error("Failed to load fire evacuation plans.");
      setFireEvacPlans([]);
    } finally {
      setLoadingPlans(false);
    }
  }, [residentId]);

  useEffect(() => {
    void fetchFireEvacPlans();
  }, [fetchFireEvacPlans]);

  const latestPlan = fireEvacPlans[0];

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!fileInputRef.current?.files?.[0]) {
      toast.error("Please select a file");
      return;
    }

    const file = fileInputRef.current.files[0];
    
    // Validate file type
    if (!file.type.includes("pdf") && !file.type.includes("document")) {
      toast.error("Please upload a PDF or document file");
      return;
    }

    setUploading(true);
    
    try {
      // Step 1: Upload file to /api/uploads
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('fileType', 'fire-evac');

      const uploadRes = await fetch('/api/uploads', {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadRes.ok) {
        throw new Error("File upload failed");
      }

      const uploadData = await uploadRes.json();
      const fileId = uploadData.fileId;

      // Step 2: Create Fire Evac record with metadata
      const res = await fetch('/api/care/fire-evac-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          residentId,
          fileStorageId: fileId,
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type,
          mobilityNeeds: formData.mobilityNeeds,
          assistanceRequired: formData.assistanceRequired,
          medicalEquipment: formData.medicalEquipment,
          specialInstructions: formData.specialInstructions,
          notes: formData.notes,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save fire evacuation plan");
      }
      
      toast.success("Fire evacuation plan uploaded successfully!");
      setShowUploadForm(false);
      setFormData({
        mobilityNeeds: "",
        assistanceRequired: "",
        medicalEquipment: "",
        specialInstructions: "",
        notes: "",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await fetchFireEvacPlans(); // Refresh plans list
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload fire evacuation plan");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (fileStorageId: string) => {
    window.open(`/api/uploads?fileId=${fileStorageId}`, '_blank');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ok":
        return "bg-green-100 text-green-800";
      case "due-soon":
        return "bg-orange-100 text-orange-800";
      case "overdue":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ok":
        return "Current";
      case "due-soon":
        return "Due Soon";
      case "overdue":
        return "Overdue";
      default:
        return status;
    }
  };

  if (loadingPlans) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading fire evacuation plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Fire Evacuation Plans - {residentName}</h3>
          <p className="text-sm text-gray-600">Plans are renewed annually</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowUploadForm(!showUploadForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            {showUploadForm ? "Cancel" : "Upload New Plan"}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Upload Form */}
      {showUploadForm && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h4 className="text-md font-semibold mb-4">Upload Fire Evacuation Plan for {residentName}</h4>
          <form onSubmit={handleFileUpload} className="space-y-4">
            <div>
              <label htmlFor="plan-document" className="block text-sm font-medium text-gray-700 mb-2">
                Plan Document (PDF or DOC) *
              </label>
              <input
                id="plan-document"
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="mobility-needs" className="block text-sm font-medium text-gray-700 mb-2">
                Mobility Needs
              </label>
              <input
                type="text"
                id="mobility-needs"
                value={formData.mobilityNeeds}
                onChange={(e) => setFormData({ ...formData, mobilityNeeds: e.target.value })}
                placeholder="e.g., Wheelchair, Walker, Ambulatory"
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="assistance-required" className="block text-sm font-medium text-gray-700 mb-2">
                Assistance Required
              </label>
              <input
                type="text"
                id="assistance-required"
                value={formData.assistanceRequired}
                onChange={(e) => setFormData({ ...formData, assistanceRequired: e.target.value })}
                placeholder="e.g., Two-person assist, One-person assist"
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="medical-equipment" className="block text-sm font-medium text-gray-700 mb-2">
                Medical Equipment
              </label>
              <input
                type="text"
                id="medical-equipment"
                value={formData.medicalEquipment}
                onChange={(e) => setFormData({ ...formData, medicalEquipment: e.target.value })}
                placeholder="e.g., Oxygen tank, CPAP machine"
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="special-instructions" className="block text-sm font-medium text-gray-700 mb-2">
                Special Instructions
              </label>
              <textarea
                id="special-instructions"
                value={formData.specialInstructions}
                onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })}
                placeholder="Any special evacuation instructions..."
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={2}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowUploadForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Upload Plan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Current Plan */}
      {latestPlan && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h4 className="text-md font-semibold">Current Plan (Version {latestPlan.version})</h4>
              <p className="text-sm text-gray-600">
                Uploaded {new Date(latestPlan.createdAt || Date.now()).toLocaleDateString()}
              </p>
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(latestPlan.status)}`}>
              {getStatusLabel(latestPlan.status)}
            </span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm font-medium text-gray-700">Due Date:</span>
                <p className="text-sm text-gray-900">{new Date(latestPlan.dueDate).toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Days Until Due:</span>
                <p className="text-sm text-gray-900">{latestPlan.daysUntilDue} days</p>
              </div>
            </div>

            {latestPlan.mobilityNeeds && (
              <div>
                <span className="text-sm font-medium text-gray-700">Mobility Needs:</span>
                <p className="text-sm text-gray-900">{latestPlan.mobilityNeeds}</p>
              </div>
            )}

            {latestPlan.assistanceRequired && (
              <div>
                <span className="text-sm font-medium text-gray-700">Assistance Required:</span>
                <p className="text-sm text-gray-900">{latestPlan.assistanceRequired}</p>
              </div>
            )}

            {latestPlan.medicalEquipment && (
              <div>
                <span className="text-sm font-medium text-gray-700">Medical Equipment:</span>
                <p className="text-sm text-gray-900">{latestPlan.medicalEquipment}</p>
              </div>
            )}

            {latestPlan.specialInstructions && (
              <div>
                <span className="text-sm font-medium text-gray-700">Special Instructions:</span>
                <p className="text-sm text-gray-900">{latestPlan.specialInstructions}</p>
              </div>
            )}

            <div className="pt-3 border-t">
              <button
                onClick={() => handleDownload(latestPlan.fileStorageId)}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                📥 Download Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Previous Plans */}
      {fireEvacPlans.length > 1 && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h4 className="text-md font-semibold mb-4">Previous Plans</h4>
          <div className="space-y-3">
            {fireEvacPlans.slice(1).map((plan) => (
              <div key={plan.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="font-medium">Version {plan.version}</span>
                      <span className="text-sm text-gray-600">
                        • {new Date(plan.createdAt || Date.now()).toLocaleDateString()}
                      </span>
                    </div>
                    {plan.notes && (
                      <p className="text-sm text-gray-600">{plan.notes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDownload(plan.fileStorageId)}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    📥 Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {fireEvacPlans.length === 0 && !showUploadForm && (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
          <div className="text-5xl mb-4">🚨</div>
          <p className="text-lg font-medium text-gray-900 mb-2">No Fire Evacuation Plan</p>
          <p className="text-sm text-gray-600 mb-4">
            Upload a fire evacuation plan for {residentName}
          </p>
          <button
            onClick={() => setShowUploadForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Upload Plan
          </button>
        </div>
      )}
    </div>
  );
}

