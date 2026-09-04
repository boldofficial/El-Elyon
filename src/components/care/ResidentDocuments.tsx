'use client';

import React, {useCallback, useMemo, useState} from 'react';
import {toast} from 'sonner';
import DocumentViewerModal from '../shared/DocumentViewerModal';
import {usePaginatedSearch} from './usePaginatedSearch';

export default function ResidentDocuments({
  residentId,
  filterSource
}: {
  residentId: string;
  filterSource?: 'generic' | 'isp' | 'fire_evac';
}) {
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: "",
    type: "medical", // medical, consent, assessment, other
    description: "",
    file: null as File | null,
  });
  const [activeDocument, setActiveDocument] = useState<{
    fileStorageId: string;
    fileName: string;
    contentType?: string;
  } | null>(null);

  const extraParams = useMemo(
    () => ({residentId, source: filterSource || 'generic'}), // Default to generic docs only
    [residentId, filterSource]
  );
  const onError = useCallback(() => toast.error('Failed to load documents'), []);

  const {
    items: documents,
    loading,
    loadingMore,
    hasMore,
    search,
    setSearch,
    debouncedSearch,
    loadMore,
    reload,
  } = usePaginatedSearch<any>({
    endpoint: '/api/care/resident-documents',
    extraParams,
    onError,
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Allow more types: PDF, DOCX, Images, etc.
    if (file.size > 20 * 1024 * 1024) { // 20MB limit
      alert("File size must be less than 20MB");
      e.target.value = "";
      return;
    }

    setUploadForm(prev => ({ ...prev, file }));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadForm.file || !uploadForm.title.trim()) {
      alert("Please fill in title and select a file");
      return;
    }

    setUploading(true);
    try {
      // 1. Upload file
      const formData = new FormData();
      formData.append('file', uploadForm.file);
      formData.append('fileType', 'resident-documents');

      const uploadRes = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("File upload failed");
      const uploadData = await uploadRes.json();

      // 2. Create document record
      const res = await fetch('/api/care/resident-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId,
          title: uploadForm.title.trim(),
          type: uploadForm.type,
          description: uploadForm.description.trim(),
          fileStorageId: uploadData.fileId,
          fileName: uploadForm.file.name,
          fileSize: uploadForm.file.size,
          contentType: uploadForm.file.type,
        }),
      });

      if (!res.ok) throw new Error("Failed to save document record");

      toast.success("Document uploaded successfully");
      setShowUploadForm(false);
      setUploadForm({
        title: "",
        type: "medical",
        description: "",
        file: null,
      });
      await reload();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      const res = await fetch('/api/care/resident-documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });

      if (!res.ok) throw new Error("Failed to delete document");
      toast.success("Document deleted");
      await reload();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDownload = (fileStorageId: string) => {
    window.open(`/api/uploads?fileId=${fileStorageId}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {filterSource === 'isp' ? 'ISP Documents' : filterSource === 'fire_evac' ? 'Fire Evacuation Plans' : 'Other Documents'}
          </h3>
          <p className="text-sm text-gray-600">
            {filterSource === 'isp'
              ? 'View Individual Support Plans for this resident.'
              : filterSource === 'fire_evac'
              ? 'View Fire Evacuation Plans for this resident.'
              : 'Manage general documents for this resident.'}
          </p>
        </div>
        {!showUploadForm && !filterSource && (
          <button
            onClick={() => setShowUploadForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Upload Document
          </button>
        )}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search documents by title or description..."
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
      />

      {showUploadForm && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
             <h4 className="text-md font-semibold mb-4">Upload New Document</h4>
             <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input
                    type="text"
                    value={uploadForm.title}
                    onChange={e => setUploadForm(prev => ({...prev, title: e.target.value}))}
                    className="w-full border rounded p-2"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                        <select
                            value={uploadForm.type}
                            onChange={e => setUploadForm(prev => ({...prev, type: e.target.value}))}
                            className="w-full border rounded p-2"
                        >
                            <option value="medical">Medical Record</option>
                            <option value="consent">Consent Form</option>
                            <option value="assessment">Assessment</option>
                            <option value="legal">Legal</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
                        <input
                            type="file"
                            onChange={handleFileSelect}
                            className="w-full border rounded p-2"
                            required
                        />
                    </div>
                </div>
                <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                     <textarea
                        value={uploadForm.description}
                        onChange={e => setUploadForm(prev => ({...prev, description: e.target.value}))}
                        className="w-full border rounded p-2"
                        rows={2}
                     />
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => setShowUploadForm(false)}
                        className="px-3 py-1 border rounded text-gray-600"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={uploading}
                        className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
                    >
                        {uploading ? "Uploading..." : "Upload"}
                    </button>
                </div>
             </form>
        </div>
      )}

      {loading ? (
        <div>Loading documents...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded border border-dashed">
            {debouncedSearch ? 'No documents match your search.' : 'No documents found.'}
        </div>
      ) : (
        <div className="grid gap-3">
            {documents.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between p-4 bg-white border rounded shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-3">
                        <div className="text-2xl">
                            {doc.contentType?.includes('pdf') ? '📄' : doc.contentType?.includes('image') ? '🖼️' : '📁'}
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-900">{doc.title}</h4>
                            <p className="text-xs text-gray-500">
                                {doc.type?.toUpperCase() || 'DOCUMENT'} • {new Date(doc.uploadedAt).toLocaleDateString()} by {doc.uploadedBy}
                            </p>
                            {doc.description && <p className="text-sm text-gray-600 mt-1">{doc.description}</p>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                         <button
                            onClick={() => setActiveDocument({
                                fileStorageId: doc.fileStorageId,
                                fileName: doc.fileName || doc.title,
                                contentType: doc.contentType
                            })}
                            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 rounded text-white font-medium"
                         >
                            View
                         </button>
                         <button
                            onClick={() => handleDownload(doc.fileStorageId)}
                            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded text-blue-700"
                         >
                            Download
                         </button>
                         <button
                            onClick={() => handleDelete(doc.id)}
                            className="px-3 py-1 text-sm bg-gray-100 hover:bg-red-50 rounded text-red-600"
                         >
                            Delete
                         </button>
                    </div>
                </div>
            ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pt-2">
            <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
                {loadingMore ? 'Loading...' : 'View More'}
            </button>
        </div>
      )}

      <DocumentViewerModal
        isOpen={!!activeDocument}
        onClose={() => setActiveDocument(null)}
        document={activeDocument}
      />
    </div>
  );
}
