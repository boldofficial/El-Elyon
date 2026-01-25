import React, { useState, useEffect } from "react";
import FireEvacManagement from "../admin/FireEvacManagement";
import { toast } from 'sonner';

type Props = {
  residentId: string;
  onBack?: () => void;
};

// TABS definition moved inside component or memoized to depend on user role
const ALL_TABS = [
  { key: "overview", label: "Overview" },
  { key: "logs", label: "Logs" },
  { key: "isp", label: "ISP" },
  { key: "fire_evac", label: "Fire Evac" },
  { key: "documents", label: "Other Documents" },
];

export default function ResidentCase({ residentId, onBack }: Props) {
  const [tab, setTab] = useState("overview");
  const [resident, setResident] = useState<any>(null);
  const [loadingResident, setLoadingResident] = useState(true);
  const [errorResident, setErrorResident] = useState<string | null>(null);

  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function fetchData() {
      setLoadingResident(true);
      setErrorResident(null);
      try {
        const [residentRes, userRes] = await Promise.all([
          fetch(`/api/care/residents?residentId=${residentId}`),
          fetch('/api/users/current')
        ]);

        if (!residentRes.ok) throw new Error('Failed to fetch resident');
        
        const residentData = await residentRes.json();
        const userData = await userRes.json();

        setResident(residentData);
        setUser(userData);
      } catch (error: any) {
        console.error('Error fetching data:', error);
        setErrorResident(error.message || 'Failed to load data.');
      } finally {
        setLoadingResident(false);
      }
    }
    fetchData();
  }, [residentId]);

  const tabs = ALL_TABS.filter(t => {
    if (t.key === 'logs' && user?.role === 'admin') return false;
    return true;
  });

  if (loadingResident) {
    return <div>Loading...</div>;
  }
  if (errorResident) {
    return <div className="text-red-600">{errorResident}</div>;
  }
  if (!resident) {
    return <div className="text-red-600">Resident not found.</div>;
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
        {tabs.map((t) => (
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
  if (!resident) return null;

  return (
    <div className="space-y-6">
      {/* Demographics & Physical */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-lg font-semibold mb-3">Resident Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><span className="font-medium text-gray-600">Name:</span> {resident.name}</div>
          <div><span className="font-medium text-gray-600">Location:</span> {resident.location}</div>
          <div><span className="font-medium text-gray-600">Date of Birth:</span> {resident.dateOfBirth || resident.dob || 'N/A'}</div>
          <div><span className="font-medium text-gray-600">Sex:</span> {resident.sex || 'N/A'}</div>
          <div><span className="font-medium text-gray-600">Height:</span> {resident.height || 'N/A'}</div>
          <div><span className="font-medium text-gray-600">Weight:</span> {resident.weight || 'N/A'}</div>
          <div><span className="font-medium text-gray-600">Hair Color:</span> {resident.hairColor || 'N/A'}</div>
          <div><span className="font-medium text-gray-600">Placement Date:</span> {resident.placementDate ? new Date(resident.placementDate).toLocaleDateString() : 'N/A'}</div>
        </div>
      </div>

      {/* Case Management */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-lg font-semibold mb-3">Case Management & Funding</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><span className="font-medium text-gray-600">Funding Agency:</span> {resident.fundingAgency || 'N/A'}</div>
          <div><span className="font-medium text-gray-600">Support Broker:</span> {resident.supportBroker || 'N/A'}</div>
          <div><span className="font-medium text-gray-600">Case Manager:</span> {resident.caseManagerName || 'N/A'}</div>
          <div><span className="font-medium text-gray-600">CM Phone:</span> {resident.caseManagerPhone || 'N/A'}</div>
          <div className="col-span-1 md:col-span-2"><span className="font-medium text-gray-600">CM Email:</span> {resident.caseManagerEmail || 'N/A'}</div>
        </div>
      </div>

      {/* Medical & Diagnosis */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-lg font-semibold mb-3">Medical & Care</h3>
        <div className="space-y-3">
          <div>
            <div className="font-medium text-gray-600 mb-1">Diagnosis:</div>
            <p className="text-gray-800 bg-gray-50 p-2 rounded">{resident.diagnosis || 'No diagnosis recorded.'}</p>
          </div>
          <div>
            <div className="font-medium text-gray-600 mb-1">Medical Info:</div>
            <p className="text-gray-800 bg-gray-50 p-2 rounded">{resident.medicalInfo || 'No medical info recorded.'}</p>
          </div>
          <div>
            <div className="font-medium text-gray-600 mb-1">Care Notes:</div>
            <p className="text-gray-800 bg-gray-50 p-2 rounded">{resident.careNotes || 'No notes.'}</p>
          </div>
          <div>
            <div className="font-medium text-gray-600 mb-1">Important Relationships:</div>
            <p className="text-gray-800 bg-gray-50 p-2 rounded">{resident.importantRelationships || 'None recorded.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogsTab({ residentId }: { residentId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [canLog, setCanLog] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ mood: "", notes: "" });
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchLogsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [logsRes, pendingAcksRes, userRes] = await Promise.all([
        fetch(`/api/care/resident-logs?residentId=${residentId}`),
        fetch(`/api/care/pending-acknowledgments`),
        fetch(`/api/users/current`),
      ]);

      if (!logsRes.ok) throw new Error('Failed to fetch logs');
      if (!pendingAcksRes.ok) throw new Error('Failed to fetch pending acknowledgments');
      if (!userRes.ok) throw new Error('Failed to fetch current user');

      const logsData = await logsRes.json();
      const pendingAcksData = await pendingAcksRes.json();
      const userData = await userRes.json();

      setLogs(logsData);
      setUser(userData);
      setCanLog(!pendingAcksData.some((ack: any) => ack.residentId === residentId));
    } catch (e: any) {
      console.error('Error fetching logs data:', e);
      setError(e.message || 'Failed to load logs data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogsData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residentId]);

  const handleAcknowledge = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/care/acknowledge-isp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residentId, ispId: 'placeholder-isp-id' }), // ispId will be determined by the backend
      });

      if (!res.ok) throw new Error('Failed to acknowledge ISP');
      toast.success('ISP acknowledged successfully!');
      await fetchLogsData(); // Refresh data
    } catch (e: any) {
      setError(e.message || "Failed to acknowledge ISP.");
      toast.error(e.message || "Failed to acknowledge ISP.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (canLog === false) {
        setError("You must acknowledge the current ISP before submitting a log.");
        setSubmitting(false);
        return;
      }
      const res = await fetch('/api/care/create-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId,
          template: "daily_notes", // Using a predefined template ID
          content: JSON.stringify({ ...form }),
        }),
      });

      if (!res.ok) throw new Error('Failed to submit log');
      toast.success('Log submitted successfully!');
      setForm({ mood: "", notes: "" });
      await fetchLogsData(); // Refresh data
    } catch (e: any) {
      setError(e.message || "Failed to submit log.");
      toast.error(e.message || "Failed to submit log.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (logId: string) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/care/edit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logId,
          residentId,
          template: "daily_notes", // Assuming same template for editing
          fields: { ...form },
        }),
      });

      if (!res.ok) throw new Error('Failed to edit log');
      toast.success('Log edited successfully!');
      setEditingLogId(null);
      setForm({ mood: "", notes: "" });
      await fetchLogsData(); // Refresh data
    } catch (e: any) {
      setError(e.message || "Failed to edit log.");
      toast.error(e.message || "Failed to edit log.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading logs...</div>;
  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <div className="mb-2">
        <b>Daily Log Template:</b> Mood, Notes
      </div>
      {user && user.role === 'admin' ? (
        <div className="mb-4 p-4 bg-gray-100 text-gray-700 rounded border border-gray-200">
          <p className="font-medium">Admin View Only</p>
          <p className="text-sm">Administrators cannot submit logs. Please log in as a Supervisor or Staff member to create entries.</p>
        </div>
      ) : (
        <>
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
              aria-label="Mood"
            />
            <textarea
              className="border rounded px-2 py-1"
              placeholder="Notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              disabled={submitting || canLog === false}
              aria-label="Notes"
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
        </>
      )}
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
              <li key={log.id} className="border-b py-2">
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
                      setEditingLogId(log.id);
                      setForm({ ...fields });
                    }}
                    disabled={submitting}
                  >
                    Edit (new version)
                  </button>
                )}
                {editingLogId === log.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleEdit(log.id);
                    }}
                    className="flex flex-col gap-1 mt-2"
                  >
                    <input
                      className="border rounded px-2 py-1"
                      placeholder="Mood"
                      value={form.mood}
                      onChange={(e) => setForm((f) => ({ ...f, mood: e.target.value }))}
                      disabled={submitting}
                      aria-label="Mood"
                    />
                    <textarea
                      className="border rounded px-2 py-1"
                      placeholder="Notes"
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      disabled={submitting}
                      aria-label="Notes"
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

function ISPTab({ residentId }: { residentId: string }) {
  const [ispFiles, setIspFiles] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [downloading, setDownloading] = useState<string | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [editingISP, setEditingISP] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const [uploadForm, setUploadForm] = useState({
    versionLabel: "",
    effectiveDate: "",
    preparedBy: "",
    notes: "",
    file: null as File | null,
  });

  // Separate form for editing
  const [editForm, setEditForm] = useState({
    versionLabel: "",
    effectiveDate: "",
    preparedBy: "",
    notes: "",
  });

  const fetchIspData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ispFilesRes, userRoleRes] = await Promise.all([
        fetch(`/api/care/isp-files?residentId=${residentId}`),
        fetch(`/api/users/role`),
      ]);

      if (!ispFilesRes.ok) throw new Error('Failed to fetch ISP files');
      if (!userRoleRes.ok) throw new Error('Failed to fetch user role');

      const ispFilesData = await ispFilesRes.json();
      const userRoleData = await userRoleRes.json();

      setIspFiles(ispFilesData);
      setUserRole(userRoleData);
    } catch (e: any) {
      console.error('Error fetching ISP data:', e);
      setError(e.message || 'Failed to load ISP data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIspData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residentId]);

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
      // Step 1: Upload file to /api/uploads
      const formData = new FormData();
      formData.append('file', uploadForm.file);
      formData.append('fileType', 'isp-files');

      const uploadRes = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error("File upload failed");
      }

      const uploadData = await uploadRes.json();
      const fileId = uploadData.fileId;

      // Step 2: Create ISP record
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
      await fetchIspData(); // Refresh data
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const startEditing = (file: any) => {
      setEditingISP(file);
      setEditForm({
          versionLabel: file.versionLabel,
          effectiveDate: new Date(file.effectiveDate).toISOString().split('T')[0],
          preparedBy: file.preparedBy || "",
          notes: file.notes || "",
      });
      setShowUploadForm(false); // Close upload form if open
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingISP) return;
    
    if (!editForm.versionLabel.trim() || !editForm.effectiveDate) {
        alert("Please fill in all required fields");
        return;
    }

    setUploading(true);
    try {
        const res = await fetch(`/api/care/isp-files`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ispFileId: editingISP.id,
                versionLabel: editForm.versionLabel.trim(),
                effectiveDate: editForm.effectiveDate, 
                preparedBy: editForm.preparedBy.trim() || undefined,
                notes: editForm.notes.trim() || undefined,
            }),
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Failed to update ISP file');
        }

        toast.success("ISP file updated successfully");
        setEditingISP(null);
        await fetchIspData();
    } catch (error: any) {
        toast.error(error.message || "Update failed");
    } finally {
        setUploading(false);
    }
  };

  const handleDownload = (ispFileId: string, fileStorageId: string) => {
     window.open(`/api/uploads?fileId=${fileStorageId}`, '_blank');
  };

  const handleActivate = async (ispFileId: string) => {
    if (!window.confirm("Are you sure you want to activate this ISP version? This will archive the current active version.")) {
      return;
    }

    setActivatingId(ispFileId);
    try {
      const res = await fetch('/api/care/isp-files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ispFileId }),
      });

      if (!res.ok) throw new Error('Failed to activate ISP file');
      toast.success("ISP file activated successfully");
      await fetchIspData(); // Refresh data
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
      const res = await fetch('/api/care/isp-files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ispFileId }),
      });

      if (!res.ok) throw new Error('Failed to delete ISP file');
      toast.success("ISP file deleted successfully");
      await fetchIspData(); // Refresh data
    } catch (error: any) {
      toast.error(error.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const canEdit = userRole?.role === "admin" || userRole?.role === "supervisor";
  const canActivate = userRole?.role === "admin" || userRole?.role === "supervisor";
  const canDelete = userRole?.role === "admin";

  if (loading) return <div>Loading ISP data...</div>;
  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div className="space-y-6">
      {/* Header with Upload Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">ISP Management</h3>
          <p className="text-sm text-gray-600">Upload, activate, and manage Individual Service Plans</p>
        </div>
        {!showUploadForm && !editingISP && (
          <button
            onClick={() => setShowUploadForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Upload New ISP
          </button>
        )}
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
                  aria-label="Version Label"
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

      {/* Edit Form */}
      {editingISP && (
        <div className="bg-blue-50 rounded-lg shadow-sm border border-blue-200 p-6">
          <h4 className="text-md font-semibold mb-4 text-blue-900">Edit ISP Details</h4>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Version Label *
                </label>
                <input
                  type="text"
                  value={editForm.versionLabel}
                  onChange={(e) => setEditForm(prev => ({ ...prev, versionLabel: e.target.value }))}
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
                  value={editForm.effectiveDate}
                  onChange={(e) => setEditForm(prev => ({ ...prev, effectiveDate: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Administrative Notes (Optional)
              </label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setEditingISP(null)}
                className="px-4 py-2 border border-blue-200 rounded-md text-blue-800 hover:bg-blue-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {uploading ? "Saving..." : "Save Changes"}
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
                  {activeISP.notes && <div><span className="font-medium">Notes:</span> {activeISP.notes}</div>}
                  <div><span className="font-medium">Activated:</span> {new Date(activeISP.activatedAt!).toLocaleString()}</div>
                </div>
              </div>
              <div className="flex flex-col space-y-2">
                <button
                  onClick={() => handleDownload(activeISP.id, activeISP.fileStorageId)}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  📥 Download
                </button>
                {canEdit && (
                    <button
                        onClick={() => startEditing(activeISP)}
                        className="px-4 py-2 bg-blue-50 text-blue-700 text-sm rounded-md border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50"
                    >
                        ✎ Edit
                    </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => handleDelete(activeISP.id)}
                    disabled={deletingId === activeISP.id}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deletingId === activeISP.id ? "Deleting..." : "🗑 Delete"}
                  </button>
                )}
              </div>
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
                      onClick={() => handleDownload(isp.id, isp.fileStorageId)}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      📥 Download
                    </button>
                    {canEdit && (
                        <button
                            onClick={() => startEditing(isp)}
                            className="px-4 py-2 bg-blue-50 text-blue-700 text-sm rounded-md border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50"
                        >
                            ✎ Edit
                        </button>
                    )}
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
                  <div className="flex flex-col space-y-2">
                    <button
                      onClick={() => handleDownload(isp.id, isp.fileStorageId)}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      📥 Download
                    </button>
                    {canEdit && (
                        <button
                            onClick={() => startEditing(isp)}
                            className="px-4 py-2 bg-blue-50 text-blue-700 text-sm rounded-md border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50"
                        >
                            ✎ Edit
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

      {/* Empty state */}
      {ispFiles.length === 0 && !showUploadForm && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-lg font-medium mb-2">No ISP files yet</p>
          <p className="text-sm">Click &quot;Upload New ISP&quot; above to get started</p>
        </div>
      )}
    </div>
  );
}

function FireEvacTab({ residentId, residentName }: { residentId: string; residentName: string }) {
  return <FireEvacManagement residentId={residentId} residentName={residentName} />;
}

function DocumentsTab({ residentId }: { residentId: string }) {
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [documentForm, setDocumentForm] = useState({
    title: "",
    type: "medical",
    notes: "",
    file: null as File | null,
  });
  const [uploadingDocument, setUploadingDocument] = useState(false);

  const handleDocumentFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setDocumentForm(prev => ({ ...prev, file }));
  };

  const handleDocumentUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!documentForm.file || !documentForm.title.trim()) {
      alert("Please fill in all required fields");
      return;
    }

    setUploadingDocument(true);
    try {
      // In a real application, you would implement an API endpoint for document uploads
      // Similar to ISP file upload, you'd get an upload URL, upload the file,
      // then record the metadata in your database.
      console.log("Uploading document for resident:", residentId);
      console.log("Document details:", documentForm);
      toast.success("Document uploaded successfully (simulated)");
      setShowUploadForm(false);
      setDocumentForm({
        title: "",
        type: "medical",
        notes: "",
        file: null,
      });
      // await fetchDocumentsData(); // Refresh data if you had a list of documents
    } catch (error: any) {
      toast.error(error.message || "Document upload failed (simulated)");
    } finally {
      setUploadingDocument(false);
    }
  };

  return (
		<div className="space-y-6">
			{/* Header with Upload Button */}
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-lg font-semibold">Other Documents</h3>
					<p className="text-sm text-gray-600">
						Upload and manage additional documents (not ISP or Fire Evac)
					</p>
				</div>
				<button
					onClick={() => setShowUploadForm(!showUploadForm)}
					className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
					{showUploadForm ? 'Cancel Upload' : 'Upload Document'}
				</button>
			</div>

			{/* Upload Form */}
			{showUploadForm && (
				<div className="bg-white rounded-lg shadow-sm border p-6">
					<h4 className="text-md font-semibold mb-4">Upload New Document</h4>
					<form onSubmit={handleDocumentUpload} className="space-y-4">
						<div>
							<label
								htmlFor="documentTitle"
								className="block text-sm font-medium text-gray-700 mb-2">
								Document Title *
							</label>
							<input
								id="documentTitle"
								type="text"
								value={documentForm.title}
								onChange={(e) =>
									setDocumentForm((prev) => ({...prev, title: e.target.value}))
								}
								placeholder="e.g., Medical Records, Consent Form"
								className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
								required
								aria-label="Document Title"
							/>
						</div>

						<div>
							<label
								htmlFor="documentType"
								className="block text-sm font-medium text-gray-700 mb-2">
								Document Type
							</label>
							<select
								id="documentType"
								value={documentForm.type}
								onChange={(e) =>
									setDocumentForm((prev) => ({...prev, type: e.target.value}))
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
								aria-label="Document Type">
								<option value="medical">Medical Records</option>
								<option value="consent">Consent Form</option>
								<option value="assessment">Assessment</option>
								<option value="other">Other</option>
							</select>
						</div>

						<div>
							<label
								htmlFor="documentNotes"
								className="block text-sm font-medium text-gray-700 mb-2">
								Notes (Optional)
							</label>
							<textarea
								id="documentNotes"
								value={documentForm.notes}
								onChange={(e) =>
									setDocumentForm((prev) => ({...prev, notes: e.target.value}))
								}
								placeholder="Additional notes about this document"
								rows={3}
								className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
								aria-label="Document Notes"
							/>
						</div>

						<div>
							<label
								htmlFor="documentFile"
								className="block text-sm font-medium text-gray-700 mb-2">
								File (PDF or DOCX) *
							</label>
							<input
								id="documentFile"
								type="file"
								accept=".pdf,.docx"
								onChange={handleDocumentFileSelect}
								className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
								required
								aria-label="Document File"
							/>
							<p className="text-xs text-gray-500 mt-1">
								Only PDF and DOCX files are allowed. Maximum size: 10MB
							</p>
						</div>

						<div className="flex justify-end space-x-3">
							<button
								type="button"
								onClick={() => setShowUploadForm(false)}
								className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors">
								Cancel
							</button>
							<button
								type="submit"
								disabled={uploadingDocument}
								className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50">
								{uploadingDocument ? 'Uploading...' : 'Upload Document'}
							</button>
						</div>
					</form>
				</div>
			)}

			{/* Documents List - Empty State */}
			<div className="text-center py-12 text-gray-500">
				<div className="text-5xl mb-4">📄</div>
				<p className="text-lg font-medium mb-2">No other documents yet</p>
				<p className="text-sm">
					Click &quot;Upload New Document&quot; above to get started
				</p>
				<p className="text-xs text-gray-400 mt-4">
					Note: ISP and Fire Evac plans are managed in their respective tabs
				</p>
			</div>
		</div>
	);
}

// Show audit trail for log actions
function AuditTrail({ residentId }: { residentId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAuditLogs() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/care/resident-audit-trail?residentId=${residentId}`);
        if (!res.ok) throw new Error('Failed to fetch audit logs');
        const data = await res.json();
        setLogs(data);
      } catch (e: any) {
        console.error('Error fetching audit logs:', e);
        setError(e.message || 'Failed to load audit logs.');
      } finally {
        setLoading(false);
      }
    }
    fetchAuditLogs();
  }, [residentId]);

  if (loading) return <div>Loading audit trail...</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!logs.length) return null;

  return (
    <div>
      <b>Audit Trail:</b>
      <ul className="text-xs mt-1">
        {logs.map((log: any) => (
          <li key={log.id}>
            {new Date(log.timestamp).toLocaleString()} - {log.event}{" "}
            {log.details && <span>({log.details})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
