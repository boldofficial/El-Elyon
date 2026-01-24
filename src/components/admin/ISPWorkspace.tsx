import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { FileText, Upload, Download, Check, Trash2, X, AlertCircle } from "lucide-react";

// Define interfaces for data structures
interface ISPFile {
  id: string; 
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
  createdAt: number;
  effectiveDate: number;
  status: "active" | "draft" | "archived";
  versionLabel: string;
  preparedBy?: string;
  activatedAt?: number;
  uploadedBy?: string;
  activatedBy?: string;
}

interface UserRole {
  role: "admin" | "supervisor" | "staff" | "kiosk" | null;
}

interface ISPWorkspaceProps {
  residentId: string;
  residentName: string;
  onClose: () => void;
}

export default function ISPWorkspace({ residentId, residentName, onClose }: ISPWorkspaceProps) {
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [ispFiles, setIspFiles] = useState<ISPFile[]>([]);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const [uploadForm, setUploadForm] = useState({
    versionLabel: "",
    effectiveDate: "",
    preparedBy: "",
    notes: "",
    file: null as File | null,
  });

  const fetchAllData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [ispFilesRes, userRoleRes] = await Promise.all([
        fetch(`/api/care/isp-files?residentId=${residentId}`),
        fetch('/api/users/role'),
      ]);

      if (!ispFilesRes.ok) throw new Error('Failed to fetch ISP files');
      
      const ispFilesData: ISPFile[] = await ispFilesRes.json();
      const userRoleData: UserRole = await userRoleRes.json();

      // Sort by creation date descending
      const sortedFiles = ispFilesData.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setIspFiles(sortedFiles);
      setUserRole(userRoleData);
    } catch (error) {
      console.error('Error fetching ISP data:', error);
      toast.error('Failed to load ISP data.');
    } finally {
      setLoadingData(false);
    }
  }, [residentId]);

  useEffect(() => {
    void fetchAllData();
  }, [fetchAllData]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error("Only PDF and DOCX files are allowed");
      e.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      e.target.value = "";
      return;
    }

    setUploadForm(prev => ({ ...prev, file }));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!uploadForm.file || !uploadForm.versionLabel.trim() || !uploadForm.effectiveDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadForm.file);
      formData.append('fileType', 'isp-files');

      const uploadRes = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("File upload failed");

      const uploadData = await uploadRes.json();
      const fileId = uploadData.fileId;

      const res = await fetch('/api/care/isp-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId,
          versionLabel: uploadForm.versionLabel.trim(),
          effectiveDate: new Date(uploadForm.effectiveDate).getTime(),
          fileStorageId: fileId,
          fileName: uploadForm.file.name,
          fileSize: uploadForm.file.size,
          contentType: uploadForm.file.type,
          preparedBy: uploadForm.preparedBy.trim() || undefined,
          notes: uploadForm.notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create ISP record");
      }

      toast.success("ISP file uploaded successfully");
      setShowUploadForm(false);
      setUploadForm({
        versionLabel: "",
        effectiveDate: "",
        preparedBy: "",
        notes: "",
        file: null,
      });
      await fetchAllData();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (fileStorageId: string) => {
    window.open(`/api/uploads?fileId=${fileStorageId}`, '_blank');
  };

  const handleActivate = async (ispFileId: string) => {
    if (!window.confirm("Are you sure you want to activate this ISP version?")) return;

    setActivatingId(ispFileId);
    try {
      const res = await fetch(`/api/care/isp-files`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ispFileId }), 
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to activate ISP file');
      }

      toast.success("ISP file activated successfully");
      await fetchAllData();
    } catch (error: any) {
      toast.error(error.message || "Activation failed");
    } finally {
      setActivatingId(null);
    }
  };

  const handleDelete = async (ispFileId: string) => {
    if (!window.confirm("Are you sure you want to delete this ISP file?")) return;

    setDeletingId(ispFileId);
    try {
      const res = await fetch(`/api/care/isp-files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ispFileId }) 
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete ISP file');
      }

      toast.success("ISP file deleted successfully");
      await fetchAllData();
    } catch (error: any) {
      toast.error(error.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const canActivate = userRole?.role === "admin" || userRole?.role === "supervisor";
  const canDelete = userRole?.role === "admin";

  const activeISP = ispFiles.find(f => f.status === 'active');
  const otherISPs = ispFiles.filter(f => f.status !== 'active');

  // Styles
  const inputClass = "flex h-9 w-full rounded-md border border-gray-300 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50";
  const btnPrimary = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-blue-600 text-white shadow hover:bg-blue-700 h-9 px-4 py-2";
  const btnSecondary = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-gray-200 bg-white shadow-sm hover:bg-gray-100 hover:text-gray-900 h-9 px-4 py-2";
  const btnDestructive = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-red-200 bg-white text-red-600 shadow-sm hover:bg-red-50 h-8 px-3 text-xs";

  if (loadingData) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center text-sm text-gray-500">
        <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <p>Loading ISP data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 h-full max-h-[80vh] overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between border-b pb-4">
        <div>
          <h2 className="text-xl font-semibold leading-none tracking-tight">ISP Management</h2>
          <p className="text-sm text-gray-500 mt-1.5">Manage Individual Service Plans for {residentName}</p>
        </div>
        <div className="flex items-center gap-2">
            {!showUploadForm && (
                <button
                    onClick={() => setShowUploadForm(true)}
                    className={btnPrimary}
                >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload New ISP
                </button>
            )}
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-6">
        
        {/* Upload Form */}
        {showUploadForm && (
            <div className="rounded-lg border bg-gray-50/50 p-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium">Upload New Document</h3>
                    <button onClick={() => setShowUploadForm(false)} className="text-xs text-gray-500 hover:text-gray-900">Cancel</button>
                </div>
                <form onSubmit={(e) => void handleUpload(e)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Version Label <span className="text-red-500">*</span>
                            </label>
                            <input
                                className={inputClass}
                                placeholder="e.g. 2024 Annual Review"
                                value={uploadForm.versionLabel}
                                onChange={e => setUploadForm({...uploadForm, versionLabel: e.target.value})}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Effective Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                className={inputClass}
                                value={uploadForm.effectiveDate}
                                onChange={e => setUploadForm({...uploadForm, effectiveDate: e.target.value})}
                                required
                            />
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            ISP File (PDF/DOCX) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="file"
                            accept=".pdf,.docx"
                            className={inputClass}
                            onChange={handleFileSelect}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Notes (Optional)
                        </label>
                        <textarea
                            className="flex min-h-[60px] w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Administrative notes only. No PHI."
                            value={uploadForm.notes}
                            onChange={e => setUploadForm({...uploadForm, notes: e.target.value})}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => setShowUploadForm(false)} className={btnSecondary}>Cancel</button>
                        <button type="submit" disabled={uploading} className={btnPrimary}>
                            {uploading && <div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                            Upload Document
                        </button>
                    </div>
                </form>
            </div>
        )}

        {/* Active ISP Card */}
        <div>
            <h3 className="text-sm font-medium mb-3 text-gray-500 uppercase tracking-wider">Current Active Plan</h3>
            {activeISP ? (
                <div className="rounded-lg border bg-white p-4 shadow-sm flex items-start justify-between gap-4">
                    <div className="flex gap-4">
                        <div className="h-10 w-10 rounded bg-blue-50 flex items-center justify-center text-blue-600">
                            <FileText className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-gray-900">{activeISP.versionLabel}</h4>
                                <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                                    Active
                                </span>
                            </div>
                            <div className="text-sm text-gray-500 mt-1 flex gap-4">
                                <span>Effective: {new Date(activeISP.effectiveDate).toLocaleDateString()}</span>
                                <span>Uploaded: {new Date(activeISP.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={() => handleDownload(activeISP.fileStorageId)} className={btnSecondary}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                    </button>
                </div>
            ) : (
                <div className="rounded-lg border border-dashed p-8 text-center bg-gray-50/50">
                    <AlertCircle className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm font-medium text-gray-900">No active ISP found</p>
                    <p className="text-xs text-gray-500 mt-1">Upload a new plan or activate a draft below.</p>
                </div>
            )}
        </div>

        {/* History Table */}
        {otherISPs.length > 0 && (
            <div>
                 <h3 className="text-sm font-medium mb-3 text-gray-500 uppercase tracking-wider">History & Drafts</h3>
                 <div className="rounded-md border">
                    <table className="w-full caption-bottom text-sm text-left">
                        <thead className="[&_tr]:border-b">
                            <tr className="border-b transition-colors hover:bg-gray-100/50 data-[state=selected]:bg-gray-100">
                                <th className="h-10 px-4 align-middle font-medium text-gray-500">Version</th>
                                <th className="h-10 px-4 align-middle font-medium text-gray-500">Status</th>
                                <th className="h-10 px-4 align-middle font-medium text-gray-500">Date</th>
                                <th className="h-10 px-4 align-middle font-medium text-gray-500 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {otherISPs.map((file) => (
                                <tr key={file.id} className="border-b transition-colors hover:bg-gray-100/50">
                                    <td className="p-4 align-middle font-medium">{file.versionLabel}</td>
                                    <td className="p-4 align-middle">
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                                            file.status === 'draft' ? 'bg-yellow-50 text-yellow-800 ring-yellow-600/20' : 'bg-gray-50 text-gray-600 ring-gray-500/10'
                                        }`}>
                                            {file.status === 'draft' ? 'Draft' : 'Archived'}
                                        </span>
                                    </td>
                                    <td className="p-4 align-middle text-gray-500">{new Date(file.createdAt).toLocaleDateString()}</td>
                                    <td className="p-4 align-middle text-right">
                                        <div className="flex justify-end gap-2">
                                            <button 
                                                onClick={() => handleDownload(file.fileStorageId)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-900 hover:bg-gray-100"
                                                title="Download"
                                            >
                                                <Download className="h-4 w-4" />
                                            </button>
                                            {canActivate && file.status === 'draft' && (
                                                <button 
                                                    onClick={() => void handleActivate(file.id)}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                                                    title="Activate"
                                                    disabled={activatingId === file.id}
                                                >
                                                    <Check className="h-4 w-4" />
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button 
                                                    onClick={() => void handleDelete(file.id)}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                                                    title="Delete"
                                                    disabled={deletingId === file.id}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
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

