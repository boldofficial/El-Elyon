/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-floating-promises */
import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import FireEvacManagement from "./FireEvacManagement";

type Props = {
  residentId: Id<"residents">;
  onBack?: () => void;
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "logs", label: "Logs" },
  { key: "isp", label: "ISP" },
  { key: "fire_evac", label: "Fire Evac" },
  { key: "documents", label: "Other Documents" },
];

export default function ResidentCase({ residentId, onBack }: Props) {
  const [tab, setTab] = useState("overview");
  const resident = useQuery(api.people.listResidents, {})?.find((r: any) => r.id === residentId);

  useEffect(() => {}, [residentId, tab]);

  if (resident === undefined) {
    return <div>Loading...</div>;
  }
  if (!resident) {
    return <div className="text-red-600">Not authorized or resident not found.</div>;
  }

  return (
    <div className="bg-white rounded shadow p-4">
      {/* Back Button */}
      {onBack && (
        <div className="mb-4 pb-4 border-b border-gray-200">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <span className="text-xl">←</span>
            <span className="font-medium">Back to Residents</span>
          </button>
        </div>
      )}
      
      {/* Resident Header */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900">{resident.name}</h2>
        <p className="text-sm text-gray-600">{resident.location}</p>
      </div>
      
      <div className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`px-3 py-1 rounded ${tab === t.key ? "bg-blue-600 text-white" : "bg-gray-200"}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>
        {tab === "overview" && <OverviewTab resident={resident} />}
        {tab === "logs" && <LogsTab residentId={residentId} />}
        {tab === "isp" && <ISPTab residentId={residentId} />}
        {tab === "fire_evac" && <FireEvacTab residentId={residentId} residentName={resident.name} />}
        {tab === "documents" && <DocumentsTab residentId={residentId} />}
      </div>
    </div>
  );
}

function OverviewTab({ resident }: { resident: any }) {
  return (
    <div>
      <div><b>Name:</b> {resident.name}</div>
      <div><b>Location:</b> {resident.location}</div>
    </div>
  );
}

function LogsTab({ residentId }: { residentId: Id<"residents"> }) {
  const logs = useQuery(api.kiosk.listResidentLogs, { residentId }) || [];
  const canLog = useQuery(api.kiosk.canLogForResident, { residentId });
  const acknowledgeIsp = useMutation(api.kiosk.acknowledgeIsp);
  const createLog = useMutation(api.kiosk.createResidentLog);
  const editLog = useMutation(api.kiosk.editResidentLog);
  // const user = useQuery(api.auth.loggedInUser);
    const user = useQuery(api.users.getCurrentUser);
  

  const [form, setForm] = useState({ mood: "", notes: "" });
  const [editingLogId, setEditingLogId] = useState<Id<"resident_logs"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const latestLog = logs.length > 0 ? logs[0] : null;

  const handleAcknowledge = async () => {
    setError(null);
    try {
      await acknowledgeIsp({ residentId });
    } catch (e: any) {
      setError(e.message || "Failed to acknowledge ISP.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (!canLog) {
        setError("You must acknowledge the current ISP before submitting a log.");
        setSubmitting(false);
        return;
      }
      await createLog({
        residentId,
        template: "Daily Note",
        fields: { ...form },
      });
      setForm({ mood: "", notes: "" });
    } catch (e: any) {
      setError(e.message || "Failed to submit log.");
    }
    setSubmitting(false);
  };

  const handleEdit = async (logId: Id<"resident_logs">) => {
    setError(null);
    setSubmitting(true);
    try {
      await editLog({
        logId,
        fields: { ...form },
      });
      setEditingLogId(null);
      setForm({ mood: "", notes: "" });
    } catch (e: any) {
      setError(e.message || "Failed to edit log.");
    }
    setSubmitting(false);
  };

  return (
    <div>
      <div className="mb-2">
        <b>Daily Log Template:</b> Mood, Notes
      </div>
      {user && residentId && canLog === false && (
        <div className="mb-2 p-2 bg-yellow-100 text-yellow-800 rounded">
          <div>
            <b>ISP must be acknowledged before submitting a log.</b>
          </div>
          <button
            className="button mt-2"
            onClick={handleAcknowledge}
            disabled={submitting}
          >
            Acknowledge ISP
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 mb-4">
        <input
          className="border rounded px-2 py-1"
          placeholder="Mood"
          value={form.mood}
          onChange={(e) => setForm((f) => ({ ...f, mood: e.target.value }))}
          disabled={submitting || canLog === false}
        />
        <textarea
          className="border rounded px-2 py-1"
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          disabled={submitting || canLog === false}
        />
        <button
          className="button"
          type="submit"
          disabled={submitting || canLog === false}
        >
          Submit Log
        </button>
        {error && <div className="text-red-600">{error}</div>}
      </form>
      <div>
        <b>Log History (latest first):</b>
        <ul className="text-xs mt-2">
          {logs.map((log: any) => {
            let fields = { mood: "", notes: "" };
            try {
              fields = JSON.parse(log.content);
            } catch {
              fields = { mood: "", notes: "" };
            }
            return (
              <li key={log._id} className="border-b py-2">
                <div>
                  <b>v{log.version}</b> | <b>Author:</b> {log.authorName} |{" "}
                  <b>Created:</b> {new Date(log.createdAt).toLocaleString()}
                </div>
                <div>
                  <b>Mood:</b> {fields.mood} <br />
                  <b>Notes:</b> {fields.notes}
                </div>
                {user && user.clerkUserId === log.authorId && (
                  <button
                    className="button mt-1"
                    onClick={() => {
                      setEditingLogId(log._id as Id<"resident_logs">);
                      setForm({ ...fields });
                    }}
                    disabled={submitting}
                  >
                    Edit (new version)
                  </button>
                )}
                {editingLogId === log._id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleEdit(log._id as Id<"resident_logs">);
                    }}
                    className="flex flex-col gap-1 mt-2"
                  >
                    <input
                      className="border rounded px-2 py-1"
                      placeholder="Mood"
                      value={form.mood}
                      onChange={(e) => setForm((f) => ({ ...f, mood: e.target.value }))}
                      disabled={submitting}
                    />
                    <textarea
                      className="border rounded px-2 py-1"
                      placeholder="Notes"
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      disabled={submitting}
                    />
                    <button className="button" type="submit" disabled={submitting}>
                      Save New Version
                    </button>
                    <button
                      className="button"
                      type="button"
                      onClick={() => setEditingLogId(null)}
                    >
                      Cancel
                    </button>
                    {error && <div className="text-red-600">{error}</div>}
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-4">
        <AuditTrail residentId={residentId} />
      </div>
    </div>
  );
}

function ISPTab({ residentId }: { residentId: Id<"residents"> }) {
  const ispFiles = useQuery(api.isp.listISPFiles, { residentId }) || [];
  const downloadISP = useAction(api.isp.generateISPDownloadUrl);
  const generateUploadUrl = useMutation(api.isp.generateISPUploadUrl);
  const createISPFile = useMutation(api.isp.createISPFile);
  const activateISPFile = useMutation(api.isp.activateISPFile);
  const deleteISPFile = useMutation(api.isp.deleteISPFile);
  const userRole = useQuery(api.settings.getUserRole);
  
  const [downloading, setDownloading] = useState<string | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activatingId, setActivatingId] = useState<Id<"isp_files"> | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"isp_files"> | null>(null);
  
  const [uploadForm, setUploadForm] = useState({
    versionLabel: "",
    effectiveDate: "",
    preparedBy: "",
    notes: "",
    file: null as File | null,
  });

  const activeISP = ispFiles.find(file => file.status === "active");
  const draftISPs = ispFiles.filter(file => file.status === "draft");
  const archivedISPs = ispFiles.filter(file => file.status === "archived");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];

    if (!allowedTypes.includes(file.type)) {
      alert("Only PDF and DOCX files are allowed");
      e.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert("File size must be less than 10MB");
      e.target.value = "";
      return;
    }

    setUploadForm(prev => ({ ...prev, file }));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!uploadForm.file || !uploadForm.versionLabel.trim() || !uploadForm.effectiveDate) {
      alert("Please fill in all required fields");
      return;
    }

    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({ residentId });
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": uploadForm.file.type },
        body: uploadForm.file,
      });

      if (!result.ok) {
        throw new Error("File upload failed");
      }

      const { storageId } = await result.json();

      await createISPFile({
        residentId,
        versionLabel: uploadForm.versionLabel.trim(),
        effectiveDate: new Date(uploadForm.effectiveDate).getTime(),
        fileStorageId: storageId,
        fileName: uploadForm.file.name,
        fileSize: uploadForm.file.size,
        contentType: uploadForm.file.type,
        preparedBy: uploadForm.preparedBy.trim() || undefined,
        notes: uploadForm.notes.trim() || undefined,
      });

      alert("ISP file uploaded successfully");
      setShowUploadForm(false);
      setUploadForm({
        versionLabel: "",
        effectiveDate: "",
        preparedBy: "",
        notes: "",
        file: null,
      });
    } catch (error: any) {
      alert(error.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (ispFileId: Id<"isp_files">) => {
    setDownloading(ispFileId);
    try {
      const result = await downloadISP({ ispFileId });
      if (result?.downloadUrl) {
        window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e: any) {
      alert("Download failed: " + (e.message || "Unknown error"));
    }
    setDownloading(null);
  };

  const handleActivate = async (ispFileId: Id<"isp_files">) => {
    if (!window.confirm("Are you sure you want to activate this ISP version? This will archive the current active version.")) {
      return;
    }

    setActivatingId(ispFileId);
    try {
      await activateISPFile({ ispFileId });
      alert("ISP file activated successfully");
    } catch (error: any) {
      alert(error.message || "Activation failed");
    } finally {
      setActivatingId(null);
    }
  };

  const handleDelete = async (ispFileId: Id<"isp_files">) => {
    if (!window.confirm("Are you sure you want to delete this ISP file? This action cannot be undone.")) {
      return;
    }

    setDeletingId(ispFileId);
    try {
      await deleteISPFile({ ispFileId });
      alert("ISP file deleted successfully");
    } catch (error: any) {
      alert(error.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const canActivate = userRole?.role === "admin" || userRole?.role === "supervisor";
  const canDelete = userRole?.role === "admin";

  return (
    <div className="space-y-6">
      {/* Header with Upload Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">ISP Management</h3>
          <p className="text-sm text-gray-600">Upload, activate, and manage Individual Service Plans</p>
        </div>
        <button
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          {showUploadForm ? "Cancel Upload" : "Upload New ISP"}
        </button>
      </div>

      {/* Upload Form */}
      {showUploadForm && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h4 className="text-md font-semibold mb-4">Upload New ISP File</h4>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Version Label *
                </label>
                <input
                  type="text"
                  value={uploadForm.versionLabel}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, versionLabel: e.target.value }))}
                  placeholder="e.g., 2024-Q1, Annual Review 2024"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Effective Date *
                </label>
                <input
                  type="date"
                  value={uploadForm.effectiveDate}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, effectiveDate: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prepared By (Optional)
              </label>
              <input
                type="text"
                value={uploadForm.preparedBy}
                onChange={(e) => setUploadForm(prev => ({ ...prev, preparedBy: e.target.value }))}
                placeholder="Name of person who prepared this ISP"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Administrative Notes (Optional)
              </label>
              <textarea
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ISP File (PDF or DOCX) *
              </label>
              <input
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

      {/* Active ISP */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Active ISP</h3>
        {activeISP ? (
          <div className="border border-green-200 bg-green-50 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Active
                  </span>
                  <span className="font-medium">{activeISP.versionLabel}</span>
                </div>
                <div className="text-sm text-gray-700 space-y-1">
                  <div><span className="font-medium">Effective Date:</span> {new Date(activeISP.effectiveDate).toLocaleDateString()}</div>
                  <div><span className="font-medium">File:</span> {activeISP.fileName}</div>
                  <div><span className="font-medium">Size:</span> {(activeISP.fileSize / 1024).toFixed(1)} KB</div>
                  {activeISP.preparedBy && <div><span className="font-medium">Prepared By:</span> {activeISP.preparedBy}</div>}
                  <div><span className="font-medium">Activated:</span> {new Date(activeISP.activatedAt!).toLocaleString()}</div>
                </div>
              </div>
              <button
                onClick={() => handleDownload(activeISP.id)}
                disabled={downloading === activeISP.id}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {downloading === activeISP.id ? "Downloading..." : "📥 Download"}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 border border-gray-200 rounded-lg">
            <div className="text-4xl mb-2">📋</div>
            <p>No active ISP</p>
            <p className="text-sm">Upload and activate an ISP above</p>
          </div>
        )}
      </div>

      {/* Draft ISPs */}
      {draftISPs.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Draft ISPs ({draftISPs.length})</h3>
          <div className="space-y-3">
            {draftISPs.map((isp) => (
              <div key={isp.id} className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Draft
                      </span>
                      <span className="font-medium">{isp.versionLabel}</span>
                    </div>
                    <div className="text-sm text-gray-700 space-y-1">
                      <div><span className="font-medium">Effective Date:</span> {new Date(isp.effectiveDate).toLocaleDateString()}</div>
                      <div><span className="font-medium">File:</span> {isp.fileName}</div>
                      <div><span className="font-medium">Uploaded:</span> {new Date(isp.uploadedAt).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2">
                    <button
                      onClick={() => handleDownload(isp.id)}
                      disabled={downloading === isp.id}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {downloading === isp.id ? "Downloading..." : "📥 Download"}
                    </button>
                    {canActivate && (
                      <button
                        onClick={() => handleActivate(isp.id)}
                        disabled={activatingId === isp.id}
                        className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {activatingId === isp.id ? "Activating..." : "✓ Activate"}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(isp.id)}
                        disabled={deletingId === isp.id}
                        className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {deletingId === isp.id ? "Deleting..." : "🗑 Delete"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Archived ISPs */}
      {archivedISPs.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Archived ISPs ({archivedISPs.length})</h3>
          <div className="space-y-3">
            {archivedISPs.map((isp) => (
              <div key={isp.id} className="border border-gray-200 bg-gray-50 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Archived
                      </span>
                      <span className="font-medium">{isp.versionLabel}</span>
                    </div>
                    <div className="text-sm text-gray-700 space-y-1">
                      <div><span className="font-medium">Effective Date:</span> {new Date(isp.effectiveDate).toLocaleDateString()}</div>
                      <div><span className="font-medium">File:</span> {isp.fileName}</div>
                      <div><span className="font-medium">Archived:</span> {new Date(isp.archivedAt!).toLocaleString()}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(isp.id)}
                    disabled={downloading === isp.id}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {downloading === isp.id ? "Downloading..." : "📥 Download"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {ispFiles.length === 0 && !showUploadForm && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-lg font-medium mb-2">No ISP files yet</p>
          <p className="text-sm">Click "Upload New ISP" above to get started</p>
        </div>
      )}
    </div>
  );
}

function FireEvacTab({ residentId, residentName }: { residentId: Id<"residents">; residentName: string }) {
  return <FireEvacManagement residentId={residentId} residentName={residentName} />;
}

function DocumentsTab({ residentId }: { residentId: Id<"residents"> }) {
  const [showUploadForm, setShowUploadForm] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header with Upload Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Other Documents</h3>
          <p className="text-sm text-gray-600">Upload and manage additional documents (not ISP or Fire Evac)</p>
        </div>
        <button
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          {showUploadForm ? "Cancel Upload" : "Upload Document"}
        </button>
      </div>

      {/* Upload Form */}
      {showUploadForm && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h4 className="text-md font-semibold mb-4">Upload New Document</h4>
          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Title *
              </label>
              <input
                type="text"
                placeholder="e.g., Medical Records, Consent Form"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Type
              </label>
              <select className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="medical">Medical Records</option>
                <option value="consent">Consent Form</option>
                <option value="assessment">Assessment</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (Optional)
              </label>
              <textarea
                placeholder="Additional notes about this document"
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                File (PDF or DOCX) *
              </label>
              <input
                type="file"
                accept=".pdf,.docx"
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
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Upload Document
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Documents List - Empty State */}
      <div className="text-center py-12 text-gray-500">
        <div className="text-5xl mb-4">📄</div>
        <p className="text-lg font-medium mb-2">No other documents yet</p>
        <p className="text-sm">Upload documents using the button above</p>
        <p className="text-xs text-gray-400 mt-4">Note: ISP and Fire Evac plans are managed in their respective tabs</p>
      </div>
    </div>
  );
}

// Show audit trail for log actions
function AuditTrail({ residentId }: { residentId: Id<"residents"> }) {
  const logs = useQuery(api.kiosk.getResidentAuditTrail, { residentId }) || [];
  if (!logs.length) return null;
  return (
    <div>
      <b>Audit Trail:</b>
      <ul className="text-xs mt-1">
        {logs.map((log: any) => (
          <li key={log._id}>
            {new Date(log.timestamp).toLocaleString()} - {log.event}{" "}
            {log.details && <span>({log.details})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
