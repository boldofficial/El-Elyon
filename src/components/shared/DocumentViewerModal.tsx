'use client';

import React, { useState, useEffect } from 'react';
import { X, Download, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: {
    fileStorageId: string;
    fileName: string;
    contentType?: string;
  } | null;
}

export default function DocumentViewerModal({ isOpen, onClose, document }: DocumentViewerModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !document) {
      setUrl(null);
      setError(null);
      return;
    }

    const fetchUrl = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/uploads?fileId=${document.fileStorageId}&json=true`);
        if (!res.ok) throw new Error('Failed to load document URL');
        const data = await res.json();
        setUrl(data.url);
      } catch (err: any) {
        console.error('Error fetching document URL:', err);
        setError(err.message || 'Failed to load document');
        toast.error('Failed to load document for viewing');
      } finally {
        setLoading(false);
      }
    };

    fetchUrl();
  }, [isOpen, document]);

  if (!isOpen || !document) return null;

  const isImage = document.contentType?.startsWith('image/') || 
                  document.fileName?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);
  const isPdf = document.contentType === 'application/pdf' || 
                document.fileName?.toLowerCase().endsWith('.pdf');
  
  // Browsers can't natively render DOCX, so we fallback to download
  const canViewInline = isImage || isPdf;

  const handleDownload = () => {
    window.open(`/api/uploads?fileId=${document.fileStorageId}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl flex flex-col h-[90vh] max-h-[900px] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 shrink-0">
          <div className="flex items-center gap-2 truncate pr-4">
            <FileText className="w-5 h-5 text-blue-600 shrink-0" />
            <h3 className="font-medium text-gray-900 truncate" title={document.fileName}>
              {document.fileName}
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-md transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-100 relative flex items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-500 font-medium">Loading document...</p>
            </div>
          ) : error ? (
            <div className="text-center p-6 bg-white rounded-lg shadow-sm border border-red-100 max-w-md">
              <div className="text-red-500 text-4xl mb-3">⚠️</div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">Error Loading Document</h4>
              <p className="text-gray-600 mb-4">{error}</p>
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Try Downloading Instead
              </button>
            </div>
          ) : !canViewInline ? (
             <div className="text-center p-8 bg-white rounded-lg shadow-sm border max-w-md">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">Preview Not Available</h4>
                <p className="text-gray-600 mb-6">
                  This file type cannot be viewed directly in the browser. Please download the file to view it.
                </p>
                <button
                  onClick={handleDownload}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium flex items-center gap-2 mx-auto"
                >
                  <Download className="w-4 h-4" />
                  Download File
                </button>
             </div>
          ) : url ? (
            isImage ? (
              <img 
                src={url} 
                alt={document.fileName}
                className="max-w-full max-h-full object-contain p-4"
              />
            ) : isPdf ? (
              <iframe 
                src={url} 
                className="w-full h-full border-0"
                title={document.fileName}
              />
            ) : null
          ) : null}
        </div>
      </div>
    </div>
  );
}
