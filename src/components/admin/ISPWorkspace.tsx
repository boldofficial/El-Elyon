import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

// Define interfaces for data structures
interface ISPFile {
  id: string; // Use 'id' instead of '_id' for consistency with Next.js API responses
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
  url: string; // URL to download the file
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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
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
        fetch(`/api/supervisor/isps?residentId=${residentId}`),
        fetch('/api/users/role'),
      ]);

      const ispFilesData: ISPFile[] = await ispFilesRes.json();
      const userRoleData: UserRole = await userRoleRes.json();

      setIspFiles(ispFilesData);
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

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error("Only PDF and DOCX files are allowed");
      e.target.value = "";
      return;
    }

    // Validate file size (max 10MB)
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
      // Step 1: Request upload URL and create ISP file metadata
      const res = await fetch('/api/supervisor/isps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          residentId,
          versionLabel: uploadForm.versionLabel.trim(),
          effectiveDate: new Date(uploadForm.effectiveDate).getTime(),
          fileName: uploadForm.file.name,
          fileSize: uploadForm.file.size,
          contentType: uploadForm.file.type,
          preparedBy: uploadForm.preparedBy.trim() || undefined,
          notes: uploadForm.notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to prepare ISP upload");
      }

      const { uploadUrl } = await res.json(); // Assuming API returns uploadUrl

      // Step 2: Upload file to the received URL
      const uploadResult = await fetch(uploadUrl, {
        method: "PUT", // Use PUT for direct S3/blob storage upload
        headers: { "Content-Type": uploadForm.file.type },
        body: uploadForm.file,
      });

      if (!uploadResult.ok) {
        throw new Error("File upload failed");
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
      await fetchAllData(); // Refresh data
    } catch (error: any) {
      toast.error(error.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (ispFileId: string, fileName: string) => {
    setDownloadingId(ispFileId);
    try {
      const res = await fetch(`/api/supervisor/isps/${ispFileId}/download`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to generate download URL');
      }
      const { downloadUrl } = await res.json();
      
      // Create a temporary link to download the file
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success("Download started");
    } catch (error: any) {
      toast.error(error.message || "Download failed");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleActivate = async (ispFileId: string) => {
    if (!window.confirm("Are you sure you want to activate this ISP version? This will archive the current active version.")) {
      return;
    }

    setActivatingId(ispFileId);
    try {
      const res = await fetch(`/api/supervisor/isps/${ispFileId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}), // No specific body needed for this API
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to activate ISP file');
      }

      toast.success("ISP file activated successfully");
      await fetchAllData(); // Refresh data
    } catch (error: any) {
      toast.error(error.message || "Activation failed");
    } finally {
      setActivatingId(null);
    }
  };

  const handleDelete = async (ispFileId: string) => {
    if (!window.confirm("Are you sure you want to delete this ISP file? This action cannot be undone.")) {
      return;
    }

    setDeletingId(ispFileId);
    try {
      const res = await fetch(`/api/supervisor/isps/${ispFileId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete ISP file');
      }

      toast.success("ISP file deleted successfully");
      await fetchAllData(); // Refresh data
    } catch (error: any) {
      toast.error(error.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const canActivate = userRole?.role === "admin" || userRole?.role === "supervisor";
  const canDelete = userRole?.role === "admin";

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading ISP files...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">ISP Files for {residentName}</h2>
          <p className="text-gray-600">Individual Service Plans</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowUploadForm(!showUploadForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            {showUploadForm ? "Cancel" : "Upload ISP (Draft)"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Upload Form */}
      {showUploadForm && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold mb-4">Upload New ISP File</h3>
          <form onSubmit={(e) => void handleUpload(e)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="version-label" className="block text-sm font-medium text-gray-700 mb-2">
                  Version Label *
                </label>
                <input
                  id="version-label"
                  type="text"
                  value={uploadForm.versionLabel}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, versionLabel: e.target.value }))}
                  placeholder="e.g., 2024-Q1, Annual Review 2024"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="effective-date" className="block text-sm font-medium text-gray-700 mb-2">
                  Effective Date *
                </label>
                <input
                  id="effective-date"
                  type="date"
                  value={uploadForm.effectiveDate}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, effectiveDate: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="prepared-by" className="block text-sm font-medium text-gray-700 mb-2">
                Prepared By (Optional)
              </label>
              <input
                id="prepared-by"
                type="text"
                value={uploadForm.preparedBy}
                onChange={(e) => setUploadForm(prev => ({ ...prev, preparedBy: e.target.value }))}
                placeholder="Name of person who prepared this ISP"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="admin-notes" className="block text-sm font-medium text-gray-700 mb-2">
                Administrative Notes (Optional)
              </label>
              <textarea
                id="admin-notes"
                value={uploadForm.notes}
                onChange={(e) => setUploadForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Administrative notes (NO personal health information)"
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-red-600 mt-1">
                ⚠️ Do not include any personal health information in notes
              </p>
            </div>

            <div>
              <label htmlFor="isp-file" className="block text-sm font-medium text-gray-700 mb-2">
                ISP File (PDF or DOCX) *
              </label>
              <input
                id="isp-file"
                type="file"
                accept=".pdf,.docx"
                onChange={handleFileSelect}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Only PDF and DOCX files are allowed. Maximum size: 10MB
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowUploadForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Upload ISP"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ISP Files List */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">ISP Files ({ispFiles.length})</h3>
          <p className="text-sm text-gray-600">
            All files are treated as Protected Health Information (PHI)
          </p>
        </div>

        {ispFiles.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-lg font-medium mb-2">No ISP files uploaded</p>
            <p className="text-sm">Upload the first ISP file to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {ispFiles.map((file) => (
              <div key={file.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-lg font-medium text-gray-900">
                        {file.versionLabel}
                      </h4>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        file.status === "active" 
                          ? "bg-green-100 text-green-800" 
                          : file.status === "draft"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                      }`}>
                        {file.status.charAt(0).toUpperCase() + file.status.slice(1)}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600 space-y-1">
                      <div className="flex items-center space-x-4">
                        <span>
                          <span className="font-medium">Effective:</span> {new Date(file.effectiveDate).toLocaleDateString()}
                        </span>
                        <span>
                          <span className="font-medium">Size:</span> {Math.round(file.fileSize / 1024)} KB
                        </span>
                        <span>
                          <span className="font-medium">Type:</span> {file.contentType.includes('pdf') ? 'PDF' : 'DOCX'}
                        </span>
                      </div>
                      {file.preparedBy && (
                        <div>
                          <span className="font-medium">Prepared by:</span> {file.preparedBy}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Uploaded:</span> {new Date(file.createdAt).toLocaleDateString()}
                      </div>
                      {file.activatedAt && (
                        <div>
                          <span className="font-medium">Activated:</span> {new Date(file.activatedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end space-y-2">
                    <button
                      onClick={() => void handleDownload(file.id, file.fileName)}
                      disabled={downloadingId === file.id}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {downloadingId === file.id ? "Downloading..." : "Download"}
                    </button>
                    
                    {canActivate && file.status === "draft" && (
                      <button
                        onClick={() => void handleActivate(file.id)}
                        disabled={activatingId === file.id}
                        className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {activatingId === file.id ? "Activating..." : "Activate"}
                      </button>
                    )}
                    
                    {canDelete && (
                      <button
                        onClick={() => void handleDelete(file.id)}
                        disabled={deletingId === file.id}
                        className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {deletingId === file.id ? "Deleting..." : "Delete"}
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
