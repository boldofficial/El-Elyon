import React, { useState, useEffect } from "react";
import FireEvacManagement from "../admin/FireEvacManagement";
import { toast } from 'sonner';
import ResidentActivityHistory from "./ResidentActivityHistory";
import IncidentReportsList from "./IncidentReportsList";
import IncidentReportForm from "./IncidentReportForm";

type Props = {
  residentId: string;
  onBack?: () => void;
};

const ALL_TABS = [
  { key: "overview", label: "Overview" },
  { key: "logs", label: "Logs" },
  { key: "history", label: "Recent Activity" },
  { key: "isp", label: "ISP" },
  { key: "fire_evac", label: "Fire Evac" },
  { key: "incident_reports", label: "Incident Reports" },
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

  if (loadingResident) {
    return <div className="flex items-center justify-center p-8">Loading...</div>;
  }
  
  if (errorResident) {
    return <div className="text-red-600 p-4">{errorResident}</div>;
  }
  
  if (!resident) {
    return <div className="text-red-600 p-4">Resident not found.</div>;
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
      
      {/* Tab Navigation */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {ALL_TABS.map((t) => (
          <button
            key={t.key}
            className={`px-3 py-1 rounded whitespace-nowrap transition-colors ${
              tab === t.key 
                ? "bg-blue-600 text-white" 
                : "bg-gray-200 hover:bg-gray-300"
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {tab === "overview" && <OverviewTab resident={resident} />}
        {tab === "logs" && <LogsTab residentId={residentId} />}
        {tab === "history" && <ResidentActivityHistory residentId={residentId} />}
        {tab === "isp" && <ISPTab residentId={residentId} />}
        {tab === "fire_evac" && <FireEvacTab residentId={residentId} residentName={resident.name} />}
        {tab === "incident_reports" && (
          <IncidentReportsTab 
            residentId={residentId} 
            residentName={resident.name} 
            location={resident.location} 
          />
        )}
        {tab === "documents" && <DocumentsTab residentId={residentId} />}
      </div>
    </div>
  );
}

// ============================================================================
// OVERVIEW TAB
// ============================================================================

function OverviewTab({ resident }: { resident: any }) {
  if (!resident) return null;

  return (
    <div className="space-y-6">
      {/* Demographics & Physical */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-lg font-semibold mb-3">Resident Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoField label="Name" value={resident.name} />
          <InfoField label="Location" value={resident.location} />
          <InfoField label="Date of Birth" value={resident.dateOfBirth || resident.dob} />
          <InfoField label="Sex" value={resident.sex} />
          <InfoField label="Height" value={resident.height} />
          <InfoField label="Weight" value={resident.weight} />
          <InfoField label="Hair Color" value={resident.hairColor} />
          <InfoField 
            label="Placement Date" 
            value={resident.placementDate ? new Date(resident.placementDate).toLocaleDateString() : null} 
          />
        </div>
      </div>

      {/* Case Management */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-lg font-semibold mb-3">Case Management & Funding</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoField label="Funding Agency" value={resident.fundingAgency} />
          <InfoField label="Support Broker" value={resident.supportBroker} />
          <InfoField label="Case Manager" value={resident.caseManagerName} />
          <InfoField label="CM Phone" value={resident.caseManagerPhone} />
          <div className="col-span-1 md:col-span-2">
            <InfoField label="CM Email" value={resident.caseManagerEmail} />
          </div>
        </div>
      </div>

      {/* Medical & Diagnosis */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-lg font-semibold mb-3">Medical & Care</h3>
        <div className="space-y-3">
          <TextAreaField 
            label="Diagnosis" 
            value={resident.diagnosis} 
            placeholder="No diagnosis recorded." 
          />
          <TextAreaField 
            label="Medical Info" 
            value={resident.medicalInfo} 
            placeholder="No medical info recorded." 
          />
          <TextAreaField 
            label="Care Notes" 
            value={resident.careNotes} 
            placeholder="No notes." 
          />
          <TextAreaField 
            label="Important Relationships" 
            value={resident.importantRelationships} 
            placeholder="None recorded." 
          />
        </div>
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span className="font-medium text-gray-600">{label}:</span> {value || 'N/A'}
    </div>
  );
}

function TextAreaField({ label, value, placeholder }: { label: string; value?: string | null; placeholder: string }) {
  return (
    <div>
      <div className="font-medium text-gray-600 mb-1">{label}:</div>
      <p className="text-gray-800 bg-gray-50 p-2 rounded">
        {value || placeholder}
      </p>
    </div>
  );
}

// ============================================================================
// LOGS TAB
// ============================================================================

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
  }, [residentId]);

  const handleAcknowledge = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/care/acknowledge-isp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residentId, ispId: 'placeholder-isp-id' }),
      });

      if (!res.ok) throw new Error('Failed to acknowledge ISP');
      toast.success('ISP acknowledged successfully!');
      await fetchLogsData();
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
          template: "daily_notes",
          content: JSON.stringify({ ...form }),
        }),
      });

      if (!res.ok) throw new Error('Failed to submit log');
      toast.success('Log submitted successfully!');
      setForm({ mood: "", notes: "" });
      await fetchLogsData();
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
          template: "daily_notes",
          fields: { ...form },
        }),
      });

      if (!res.ok) throw new Error('Failed to edit log');
      toast.success('Log edited successfully!');
      setEditingLogId(null);
      setForm({ mood: "", notes: "" });
      await fetchLogsData();
    } catch (e: any) {
      setError(e.message || "Failed to edit log.");
      toast.error(e.message || "Failed to edit log.");
    } finally {
      setSubmitting(false);
    }
  };

  const parseLogContent = (content: string) => {
    try {
      return JSON.parse(content);
    } catch {
      return { mood: "", notes: "" };
    }
  };

  if (loading) return <div className="p-4">Loading logs...</div>;
  if (error) return <div className="text-red-600 p-4">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <b className="text-blue-900">Daily Log Template:</b>
        <span className="text-blue-800"> Mood, Notes</span>
      </div>

      {user && user.role === 'admin' ? (
        <div className="p-4 bg-gray-100 text-gray-700 rounded border border-gray-200">
          <p className="font-medium">Admin View Only</p>
          <p className="text-sm">Administrators cannot submit logs. Please log in as a Supervisor or Staff member to create entries.</p>
        </div>
      ) : (
        <>
          {canLog === false && (
            <div className="p-4 bg-yellow-100 text-yellow-800 rounded border border-yellow-300">
              <div className="font-medium mb-2">
                ISP must be acknowledged before submitting a log.
              </div>
              <button
                className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
                onClick={handleAcknowledge}
                disabled={submitting}
              >
                Acknowledge ISP
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 bg-white border rounded-lg p-4">
            <input
              className="w-full border rounded px-3 py-2"
              placeholder="Mood"
              value={form.mood}
              onChange={(e) => setForm((f) => ({ ...f, mood: e.target.value }))}
              disabled={submitting || canLog === false}
              aria-label="Mood"
            />
            <textarea
              className="w-full border rounded px-3 py-2"
              placeholder="Notes"
              rows={4}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              disabled={submitting || canLog === false}
              aria-label="Notes"
            />
            <button
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
              type="submit"
              disabled={submitting || canLog === false}
            >
              {submitting ? 'Submitting...' : 'Submit Log'}
            </button>
          </form>
        </>
      )}

      {/* Log History */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">Log History</h3>
        {logs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">📝</div>
            <p>No logs yet</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {logs.map((log: any) => {
              const fields = parseLogContent(log.content);
              return (
                <li key={log.id} className="border-b pb-4 last:border-b-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-gray-600">
                      <span className="font-semibold">v{log.version}</span> · {log.authorName} · {new Date(log.createdAt).toLocaleString()}
                    </div>
                    {user && user.clerkUserId === log.authorId && !editingLogId && (
                      <button
                        className="text-sm px-3 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                        onClick={() => {
                          setEditingLogId(log.id);
                          setForm({ ...fields });
                        }}
                        disabled={submitting}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  
                  {editingLogId === log.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleEdit(log.id);
                      }}
                      className="space-y-2 mt-3 bg-blue-50 p-3 rounded"
                    >
                      <input
                        className="w-full border rounded px-3 py-2"
                        placeholder="Mood"
                        value={form.mood}
                        onChange={(e) => setForm((f) => ({ ...f, mood: e.target.value }))}
                        disabled={submitting}
                        aria-label="Mood"
                      />
                      <textarea
                        className="w-full border rounded px-3 py-2"
                        placeholder="Notes"
                        rows={3}
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        disabled={submitting}
                        aria-label="Notes"
                      />
                      <div className="flex gap-2">
                        <button 
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                          type="submit" 
                          disabled={submitting}
                        >
                          Save New Version
                        </button>
                        <button
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                          type="button"
                          onClick={() => {
                            setEditingLogId(null);
                            setForm({ mood: "", notes: "" });
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="bg-gray-50 p-3 rounded">
                      <div className="mb-2">
                        <span className="font-medium text-gray-700">Mood:</span> 
                        <span className="text-gray-900 ml-2">{fields.mood || 'Not specified'}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Notes:</span>
                        <p className="text-gray-900 mt-1">{fields.notes || 'No notes provided'}</p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AuditTrail residentId={residentId} />
    </div>
  );
}

// ============================================================================
// ISP TAB
// ============================================================================

function ISPTab({ residentId }: { residentId: string }) {
  const [ispFiles, setIspFiles] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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
      await fetchIspData();
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
    setShowUploadForm(false);
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
      await fetchIspData();
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
      await fetchIspData();
    } catch (error: any) {
      toast.error(error.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const canEdit = userRole?.role === "admin" || userRole?.role === "supervisor";
  const canActivate = userRole?.role === "admin" || userRole?.role === "supervisor";
  const canDelete = userRole?.role === "admin";

  if (loading) return <div className="p-4">Loading ISP data...</div>;
  if (error) return <div className="text-red-600 p-4">{error}</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
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
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
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
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
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
                className="w-full border border-gray-300 rounded-md px-3 py-2"
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
                className="w-full border border-gray-300 rounded-md px-3 py-2"
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
                className="w-full border border-gray-300 rounded-md px-3 py-2"
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
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
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
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
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
                value={editForm.preparedBy}
                onChange={(e) => setEditForm(prev => ({ ...prev, preparedBy: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Administrative Notes (Optional)
              </label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
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
      <ISPFileCard
        title="Active ISP"
        files={activeISP ? [activeISP] : []}
        emptyMessage="No active ISP"
        emptyIcon="📋"
        statusColor="green"
        onDownload={handleDownload}
        onEdit={canEdit ? startEditing : undefined}
        onActivate={undefined}
        onDelete={canDelete ? handleDelete : undefined}
        activatingId={activatingId}
        deletingId={deletingId}
      />

      {/* Draft ISPs */}
      {draftISPs.length > 0 && (
        <ISPFileCard
          title={`Draft ISPs (${draftISPs.length})`}
          files={draftISPs}
          statusColor="yellow"
          onDownload={handleDownload}
          onEdit={canEdit ? startEditing : undefined}
          onActivate={canActivate ? handleActivate : undefined}
          onDelete={canDelete ? handleDelete : undefined}
          activatingId={activatingId}
          deletingId={deletingId}
        />
      )}

      {/* Archived ISPs */}
      {archivedISPs.length > 0 && (
        <ISPFileCard
          title={`Archived ISPs (${archivedISPs.length})`}
          files={archivedISPs}
          statusColor="gray"
          onDownload={handleDownload}
          onEdit={canEdit ? startEditing : undefined}
          onActivate={undefined}
          onDelete={canDelete ? handleDelete : undefined}
          activatingId={activatingId}
          deletingId={deletingId}
        />
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

interface ISPFileCardProps {
  title: string;
  files: any[];
  emptyMessage?: string;
  emptyIcon?: string;
  statusColor: 'green' | 'yellow' | 'gray';
  onDownload: (ispFileId: string, fileStorageId: string) => void;
  onEdit?: (file: any) => void;
  onActivate?: (ispFileId: string) => void;
  onDelete?: (ispFileId: string) => void;
  activatingId: string | null;
  deletingId: string | null;
}

function ISPFileCard({
  title,
  files,
  emptyMessage,
  emptyIcon,
  statusColor,
  onDownload,
  onEdit,
  onActivate,
  onDelete,
  activatingId,
  deletingId
}: ISPFileCardProps) {
  const colorClasses = {
    green: 'border-green-200 bg-green-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    gray: 'border-gray-200 bg-gray-50'
  };

  const statusClasses = {
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    gray: 'bg-gray-100 text-gray-800'
  };

  const statusLabels = {
    green: 'Active',
    yellow: 'Draft',
    gray: 'Archived'
  };

  if (files.length === 0 && emptyMessage) {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-3">{title}</h3>
        <div className="text-center py-8 text-gray-500 border border-gray-200 rounded-lg">
          <div className="text-4xl mb-2">{emptyIcon}</div>
          <p>{emptyMessage}</p>
          <p className="text-sm">Upload and activate an ISP above</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <div className="space-y-3">
        {files.map((file) => (
          <div key={file.id} className={`border rounded-lg p-4 ${colorClasses[statusColor]}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClasses[statusColor]}`}>
                    {statusLabels[statusColor]}
                  </span>
                  <span className="font-medium">{file.versionLabel}</span>
                </div>
                <div className="text-sm text-gray-700 space-y-1">
                  <div><span className="font-medium">Effective Date:</span> {new Date(file.effectiveDate).toLocaleDateString()}</div>
                  <div><span className="font-medium">File:</span> {file.fileName}</div>
                  <div><span className="font-medium">Size:</span> {(file.fileSize / 1024).toFixed(1)} KB</div>
                  {file.preparedBy && <div><span className="font-medium">Prepared By:</span> {file.preparedBy}</div>}
                  {file.notes && <div><span className="font-medium">Notes:</span> {file.notes}</div>}
                  {file.activatedAt && <div><span className="font-medium">Activated:</span> {new Date(file.activatedAt).toLocaleString()}</div>}
                  {file.archivedAt && <div><span className="font-medium">Archived:</span> {new Date(file.archivedAt).toLocaleString()}</div>}
                  {file.uploadedAt && !file.activatedAt && <div><span className="font-medium">Uploaded:</span> {new Date(file.uploadedAt).toLocaleString()}</div>}
                </div>
              </div>
              <div className="flex flex-col space-y-2">
                <button
                  onClick={() => onDownload(file.id, file.fileStorageId)}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                >
                  📥 Download
                </button>
                {onEdit && (
                  <button
                    onClick={() => onEdit(file)}
                    className="px-4 py-2 bg-blue-50 text-blue-700 text-sm rounded-md border border-blue-200 hover:bg-blue-100 transition-colors"
                  >
                    ✎ Edit
                  </button>
                )}
                {onActivate && (
                  <button
                    onClick={() => onActivate(file.id)}
                    disabled={activatingId === file.id}
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {activatingId === file.id ? "Activating..." : "✓ Activate"}
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(file.id)}
                    disabled={deletingId === file.id}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deletingId === file.id ? "Deleting..." : "🗑 Delete"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// OTHER TABS
// ============================================================================

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
    } catch (error: any) {
      toast.error(error.message || "Document upload failed (simulated)");
    } finally {
      setUploadingDocument(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Other Documents</h3>
          <p className="text-sm text-gray-600">
            Upload and manage additional documents (not ISP or Fire Evac)
          </p>
        </div>
        <button
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          {showUploadForm ? 'Cancel Upload' : 'Upload Document'}
        </button>
      </div>

      {showUploadForm && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h4 className="text-md font-semibold mb-4">Upload New Document</h4>
          <form onSubmit={handleDocumentUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Title *
              </label>
              <input
                type="text"
                value={documentForm.title}
                onChange={(e) => setDocumentForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Medical Records, Consent Form"
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                required
                aria-label="Document Title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Type
              </label>
              <select
                value={documentForm.type}
                onChange={(e) => setDocumentForm(prev => ({ ...prev, type: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                aria-label="Document Type"
              >
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
                value={documentForm.notes}
                onChange={(e) => setDocumentForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes about this document"
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                aria-label="Document Notes"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                File (PDF or DOCX) *
              </label>
              <input
                type="file"
                accept=".pdf,.docx"
                onChange={handleDocumentFileSelect}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
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
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploadingDocument}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {uploadingDocument ? 'Uploading...' : 'Upload Document'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="text-center py-12 text-gray-500">
        <div className="text-5xl mb-4">📄</div>
        <p className="text-lg font-medium mb-2">No other documents yet</p>
        <p className="text-sm">Click "Upload Document" above to get started</p>
        <p className="text-xs text-gray-400 mt-4">
          Note: ISP and Fire Evac plans are managed in their respective tabs
        </p>
      </div>
    </div>
  );
}

function IncidentReportsTab({ 
  residentId, 
  residentName, 
  location 
}: { 
  residentId: string; 
  residentName: string; 
  location: string;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleSuccess = () => {
    setIsCreating(false);
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Incident Reports</h3>
          <p className="text-sm text-gray-600">Track and manage incident reports</p>
        </div>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Report New Incident
          </button>
        )}
      </div>

      {isCreating ? (
        <IncidentReportForm
          residentId={residentId}
          residentName={residentName}
          location={location}
          onSuccess={handleSuccess}
          onCancel={() => setIsCreating(false)}
        />
      ) : (
        <IncidentReportsList 
          residentId={residentId} 
          refreshTrigger={refreshTrigger} 
        />
      )}
    </div>
  );
}

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

  if (loading) return <div className="text-sm text-gray-500">Loading audit trail...</div>;
  if (error) return <div className="text-red-600 text-sm">{error}</div>;
  if (!logs.length) return null;

  return (
    <div className="bg-white border rounded-lg p-4">
      <h4 className="font-semibold mb-3">Audit Trail</h4>
      <ul className="text-xs space-y-1 text-gray-600">
        {logs.map((log: any) => (
          <li key={log.id}>
            {new Date(log.timestamp).toLocaleString()} - {log.event}
            {log.details && <span className="text-gray-500"> ({log.details})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
