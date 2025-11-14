import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function KioskPairingScreen({ onPairingComplete }: { onPairingComplete: (deviceData: any) => void }) {
  const [token, setToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completePairing = useMutation(api.kiosk.completePairing);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Get browser/device identifier for audit trail
      const kioskIdentifier = `${navigator.userAgent.substring(0, 50)}...`;
      
      const result = await completePairing({
        token: token.toUpperCase().trim(),
        kioskIdentifier,
      });

      // Store device info in localStorage for future sessions
      localStorage.setItem('kioskDeviceId', result.deviceId);
      localStorage.setItem('kioskLocation', result.location);
      localStorage.setItem('kioskLabel', result.deviceLabel || '');

      onPairingComplete(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Kiosk Setup</h1>
          <p className="text-gray-600">Enter the pairing token provided by your administrator</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-2">
              Pairing Token
            </label>
            <input
              id="token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter 8-character token"
              className="w-full px-4 py-3 border border-gray-300 rounded-md text-center text-2xl font-mono font-bold uppercase tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              maxLength={8}
              required
              disabled={isSubmitting}
              autoComplete="off"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">
              Token format: 8 letters and numbers (e.g., ABC123XY)
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="text-red-700 text-sm">{error}</div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || token.length !== 8}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            {isSubmitting ? "Pairing..." : "Pair Kiosk"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <div className="text-xs text-gray-500">
            <p>Need help? Contact your system administrator.</p>
            <p className="mt-2">Pairing tokens expire after 15 minutes.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
