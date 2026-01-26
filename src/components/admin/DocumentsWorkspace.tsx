'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

export default function DocumentsWorkspace() {
  const [activeTab, setActiveTab] = useState<'general' | 'isp'>('general');
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      // Depending on tab, fetch different endpoints
      let url = '/api/care/resident-documents'; // default to all
      if (activeTab === 'isp') {
        url = '/api/care/isp-files?all=true'; // Need to ensure API supports fetching ALL
      }

      const res = await fetch(url);
      if (!res.ok) {
         // Fallback if API doesn't support "all" yet, we might need to handle it
         // For now assuming the standard GET /api/care/resident-documents returns all if no residentId
         // And likely need a new tweak for ISP files to return all
         throw new Error("Failed to fetch documents");
      }
      const data = await res.json();
      setDocuments(data);
    } catch (error) {
      console.error("Error loading documents:", error);
      // toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const filteredDocuments = documents.filter((doc: any) => {
    const searchLower = searchTerm.toLowerCase();
    const residentName = doc.residentName || doc.resident?.name || '';
    const title = doc.title || doc.fileName || doc.versionLabel || '';
    
    return residentName.toLowerCase().includes(searchLower) || 
           title.toLowerCase().includes(searchLower);
  });

  const handleDownload = (fileStorageId: string) => {
    window.open(`/api/uploads?fileId=${fileStorageId}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Document Management</h2>
        
        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-lg p-1">
            <button
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'general' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                onClick={() => setActiveTab('general')}
            >
                General Documents
            </button>
            <button
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'isp' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                onClick={() => setActiveTab('isp')}
            >
                ISP Files
            </button>
        </div>
      </div>

       {/* Search */}
       <div className="bg-white p-4 rounded-lg shadow-sm border">
            <input 
                type="text" 
                placeholder="Search by resident name or document title..." 
                className="w-full border rounded-md px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
            />
       </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
             <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : filteredDocuments.length === 0 ? (
             <div className="p-8 text-center text-gray-500">No documents found.</div>
        ) : (
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Document</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resident</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uploaded</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {filteredDocuments.map((doc: any) => (
                        <tr key={doc.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                                <div className="text-sm font-medium text-gray-900">
                                    {activeTab === 'general' ? doc.title : doc.versionLabel}
                                </div>
                                <div className="text-xs text-gray-500">{doc.fileName}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                {doc.residentName || doc.resident?.name || 'Unknown'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                    activeTab === 'isp' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                                }`}>
                                    {activeTab === 'general' ? doc.type : 'ISP'}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <div>{new Date(doc.uploadedAt || doc.createdAt).toLocaleDateString()}</div>
                                <div className="text-xs">by {doc.uploadedBy}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button 
                                    onClick={() => handleDownload(doc.fileStorageId)}
                                    className="text-blue-600 hover:text-blue-900"
                                >
                                    Download
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
      </div>
    </div>
  );
}
