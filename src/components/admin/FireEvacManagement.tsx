import React, { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { FileText, Upload, Download, Trash2, X, AlertCircle, Siren, Calendar } from "lucide-react";

// Define interfaces for data structures
interface FireEvacPlan {
  id: string; // Changed from _id to id to match schema
  residentId: string;
  fileStorageId: string;
  fileName: string;
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

  const statusColors = {
      ok: "bg-green-100 text-green-700 ring-green-600/20",
      "due-soon": "bg-yellow-100 text-yellow-800 ring-yellow-600/20",
      overdue: "bg-red-100 text-red-800 ring-red-600/20",
  };

  // Styles
  const labelClass = "text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block";
  const inputClass = "flex h-9 w-full rounded-md border border-gray-300 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50";
  const btnPrimary = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-blue-600 text-white shadow hover:bg-blue-700 h-9 px-4 py-2";
  const btnSecondary = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-gray-200 bg-white shadow-sm hover:bg-gray-100 hover:text-gray-900 h-9 px-4 py-2";

  if (loadingPlans) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center text-sm text-gray-500">
        <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <p>Loading plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 h-full max-h-[80vh] overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between border-b pb-4">
        <div>
          <h2 className="text-xl font-semibold leading-none tracking-tight">Fire Evacuation Plans</h2>
          <p className="text-sm text-gray-500 mt-1.5">Manage annual evacuation plans for {residentName}</p>
        </div>
        <div className="flex items-center gap-2">
            {!showUploadForm && (
                <button
                    onClick={() => setShowUploadForm(true)}
                    className={btnPrimary}
                >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload New Plan
                </button>
            )}
            {onClose && (
                <button onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100 transition-colors">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </button>
            )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-6">
        
        {/* Upload Form */}
        {showUploadForm && (
            <div className="rounded-lg border bg-gray-50/50 p-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium">Upload New Plan</h3>
                    <button onClick={() => setShowUploadForm(false)} className="text-xs text-gray-500 hover:text-gray-900">Cancel</button>
                </div>
                <form onSubmit={handleFileUpload} className="space-y-4">
                    <div className="space-y-2">
                        <label className={labelClass}>Plan Document (PDF/DOC) <span className="text-red-500">*</span></label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.doc,.docx"
                            required
                            className={inputClass}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className={labelClass}>Mobility Needs</label>
                            <input
                                type="text"
                                className={inputClass}
                                value={formData.mobilityNeeds}
                                onChange={(e) => setFormData({ ...formData, mobilityNeeds: e.target.value })}
                                placeholder="e.g., Wheelchair, Walker"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className={labelClass}>Assistance Required</label>
                            <input
                                type="text"
                                className={inputClass}
                                value={formData.assistanceRequired}
                                onChange={(e) => setFormData({ ...formData, assistanceRequired: e.target.value })}
                                placeholder="e.g., Two-person assist"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className={labelClass}>Medical Equipment</label>
                        <input
                            type="text"
                            className={inputClass}
                            value={formData.medicalEquipment}
                            onChange={(e) => setFormData({ ...formData, medicalEquipment: e.target.value })}
                            placeholder="e.g., Oxygen tank"
                        />
                    </div>

                    <div className="space-y-2">
                         <label className={labelClass}>Special Instructions</label>
                         <textarea
                            className="flex min-h-[60px] w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                            value={formData.specialInstructions}
                            onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })}
                            placeholder="Any special evacuation instructions..."
                         />
                    </div>

                     <div className="space-y-2">
                         <label className={labelClass}>Notes</label>
                         <textarea
                            className="flex min-h-[60px] w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Additional notes..."
                         />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => setShowUploadForm(false)} className={btnSecondary}>Cancel</button>
                        <button type="submit" disabled={uploading} className={btnPrimary}>
                            {uploading && <div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                            Upload Plan
                        </button>
                    </div>
                </form>
            </div>
        )}

        {/* Current Plan */}
        <div>
             <h3 className="text-sm font-medium mb-3 text-gray-500 uppercase tracking-wider">Current Plan</h3>
             {latestPlan ? (
                <div className="rounded-lg border bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex gap-4">
                            <div className="h-10 w-10 rounded bg-red-50 flex items-center justify-center text-red-600">
                                <Siren className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="font-semibold text-gray-900">Version {latestPlan.version}</h4>
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusColors[latestPlan.status as keyof typeof statusColors] || statusColors.ok}`}>
                                        {latestPlan.status === 'ok' ? 'Current' : latestPlan.status === 'due-soon' ? 'Due Soon' : 'Overdue'}
                                    </span>
                                </div>
                                <div className="text-sm text-gray-500 mt-1 flex gap-4">
                                     <span className="flex items-center gap-1">
                                        Uploaded: {new Date(latestPlan.createdAt || Date.now()).toLocaleDateString()}
                                     </span>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => handleDownload(latestPlan.fileStorageId)} className={btnSecondary}>
                            <Download className="mr-2 h-4 w-4" />
                            Download Plan
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-6 p-4 bg-gray-50 rounded-lg border border-gray-100 mb-4">
                        <div>
                             <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">Due Date</span>
                             <div className="flex items-center gap-2 font-medium">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                {new Date(latestPlan.dueDate).toLocaleDateString()}
                             </div>
                        </div>
                        <div>
                             <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">Days Remaining</span>
                             <span className={latestPlan.daysUntilDue < 30 ? "text-red-600 font-medium" : "text-gray-900"}>
                                {latestPlan.daysUntilDue} days
                             </span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <span className="text-sm font-medium text-gray-900 block mb-1">Mobility Needs</span>
                                <p className="text-sm text-gray-600">{latestPlan.mobilityNeeds || "None listed"}</p>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-gray-900 block mb-1">Assistance Required</span>
                                <p className="text-sm text-gray-600">{latestPlan.assistanceRequired || "None listed"}</p>
                            </div>
                        </div>
                        {latestPlan.medicalEquipment && (
                             <div>
                                <span className="text-sm font-medium text-gray-900 block mb-1">Medical Equipment</span>
                                <p className="text-sm text-gray-600">{latestPlan.medicalEquipment}</p>
                            </div>
                        )}
                         {latestPlan.specialInstructions && (
                             <div>
                                <span className="text-sm font-medium text-gray-900 block mb-1">Special Instructions</span>
                                <p className="text-sm text-gray-600">{latestPlan.specialInstructions}</p>
                            </div>
                        )}
                    </div>
                </div>
             ) : (
                <div className="rounded-lg border border-dashed p-8 text-center bg-gray-50/50">
                    <AlertCircle className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm font-medium text-gray-900">No active plan found</p>
                    <p className="text-xs text-gray-500 mt-1">Upload a fire evacuation plan above.</p>
                </div>
             )}
        </div>

        {/* Previous Plans */}
        {fireEvacPlans.length > 1 && (
            <div>
                 <h3 className="text-sm font-medium mb-3 text-gray-500 uppercase tracking-wider">History</h3>
                 <div className="rounded-md border">
                    <table className="w-full caption-bottom text-sm text-left">
                        <thead className="[&_tr]:border-b">
                            <tr className="border-b transition-colors hover:bg-gray-100/50 data-[state=selected]:bg-gray-100">
                                <th className="h-10 px-4 align-middle font-medium text-gray-500">Version</th>
                                <th className="h-10 px-4 align-middle font-medium text-gray-500">Date</th>
                                <th className="h-10 px-4 align-middle font-medium text-gray-500">Notes</th>
                                <th className="h-10 px-4 align-middle font-medium text-gray-500 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                             {fireEvacPlans.slice(1).map((plan) => (
                                <tr key={plan.id} className="border-b transition-colors hover:bg-gray-100/50">
                                    <td className="p-4 align-middle font-medium">Version {plan.version}</td>
                                    <td className="p-4 align-middle text-gray-500">{new Date(plan.createdAt || Date.now()).toLocaleDateString()}</td>
                                    <td className="p-4 align-middle text-gray-500 max-w-[200px] truncate">{plan.notes || "-"}</td>
                                    <td className="p-4 align-middle text-right">
                                        <button 
                                            onClick={() => handleDownload(plan.fileStorageId)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-900 hover:bg-gray-100"
                                            title="Download"
                                        >
                                            <Download className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                             ))}
                        </tbody>
                    </table>
                 </div>
            </div>
        )}
      </div>
    </div>
  );
}

