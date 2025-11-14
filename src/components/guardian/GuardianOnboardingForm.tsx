import React, { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const COMM_CHANNELS = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "sms", label: "SMS" },
  { value: "mail", label: "Mail" },
];

export default function GuardianOnboardingForm({ onCreated }: { onCreated?: (guardianId: string) => void }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    preferredChannel: "email",
    residentIds: [] as string[],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const residents = useQuery(api.people.listResidents) || [];
  const createGuardian = useMutation(api.people.createGuardian);

  const handleResidentToggle = (residentId: string) => {
    setForm(prev => ({
      ...prev,
      residentIds: prev.residentIds.includes(residentId)
        ? prev.residentIds.filter(id => id !== residentId)
        : [...prev.residentIds, residentId]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("Guardian name is required.");
      return;
    }

    if (!form.email.trim() && !form.phone.trim()) {
      setError("Either email or phone number is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createGuardian({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || "",
        residentIds: form.residentIds as any,
      });
      
      setForm({
        name: "",
        email: "",
        phone: "",
        preferredChannel: "email",
        residentIds: [],
      });
      
      if (onCreated && result) onCreated(result);
      alert("Guardian created successfully!");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
      <h3 className="text-lg font-semibold mb-4">Add New Guardian</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Guardian Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
            required
            disabled={isSubmitting}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Communication</label>
          <select
            value={form.preferredChannel}
            onChange={e => setForm(f => ({ ...f, preferredChannel: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
            disabled={isSubmitting}
          >
            {COMM_CHANNELS.map(ch => (
              <option key={ch.value} value={ch.value}>{ch.label}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
            disabled={isSubmitting}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
            disabled={isSubmitting}
          />
        </div>
      </div>

      {/* Resident Assignment */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Assign to Residents (optional)</label>
        <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-md p-3">
          {residents.length === 0 ? (
            <p className="text-gray-500 text-sm">No residents available</p>
          ) : (
            residents.map((resident: any) => (
              <div key={resident.id} className="flex items-center space-x-2 mb-2">
                <input
                  type="checkbox"
                  id={`resident-${resident.id}`}
                  checked={form.residentIds.includes(resident.id)}
                  onChange={() => handleResidentToggle(resident.id)}
                  disabled={isSubmitting}
                  className="rounded border-gray-300"
                />
                <label htmlFor={`resident-${resident.id}`} className="text-sm text-gray-700">
                  {resident.name} ({resident.location})
                </label>
              </div>
            ))
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-700 text-sm">{error}</div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create Guardian"}
        </button>
      </div>
    </form>
  );
}
