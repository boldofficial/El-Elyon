import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

interface InviteDetails {
  valid: boolean;
  message?: string;
  name?: string;
  email?: string;
  role?: string;
  locations?: string[];
  expired?: boolean;
  hasAcceptedInvite?: boolean;
  employeeId?: string; // Assuming the API returns this after accepting
}

interface UserEmployeeLink {
  employeeId: string;
  name: string;
  role: string;
  locations: string[];
}

export default function InviteAcceptance({ token }: { token: string }) {
  const [step, setStep] = useState<"accept" | "link" | "complete">("accept");
  const [employeeData, setEmployeeData] = useState<any>(null);
  const [inviteDetails, setInviteDetails] = useState<InviteDetails | undefined>(undefined);
  const [userEmployeeLink, setUserEmployeeLink] = useState<UserEmployeeLink | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const fetchInviteDetails = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/employees/invite-details?token=${token}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch invite details');
      }
      const data: InviteDetails = await res.json();
      setInviteDetails(data);
    } catch (error: any) {
      console.error("Error fetching invite info:", error);
      setInviteDetails({ valid: false, message: error.message });
    }
  }, [token]);

  const fetchUserEmployeeLink = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/employees/check-user-link');
      if (!res.ok) {
        // If no link found, it might return 404 or similar, which is fine.
        // We just need to ensure it doesn't throw an error for a valid "no link" state.
        if (res.status === 404) {
          setUserEmployeeLink(undefined);
          return;
        }
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to check user employee link');
      }
      const data: UserEmployeeLink = await res.json();
      setUserEmployeeLink(data);
    } catch (error: any) {
      console.error("Error checking user employee link:", error);
      setUserEmployeeLink(undefined); // Ensure it's undefined on error
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchInviteDetails(), fetchUserEmployeeLink()]);
      setLoading(false);
    };
    void loadData();
  }, [fetchInviteDetails, fetchUserEmployeeLink]);

  const handleAccept = async () => {
    try {
      const res = await fetch(`/api/admin/employees/accept-invite?token=${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}), // No specific body needed for this API
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to accept invite');
      }

      const result = await res.json();
      setEmployeeData(result);
      setStep("link");
    } catch (err: any) {
      console.error("Failed to accept invite:", err);
      toast.error("Failed to accept invite: " + (err as Error).message);
    }
  };

  const handleLink = async (empId: string) => {
    try {
      const res = await fetch('/api/admin/employees/link-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ employeeId: empId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to link account');
      }

      setStep("complete");
      // Reload page after a short delay to refresh session
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      toast.error("Failed to link account: " + (err as Error).message);
    }
  };

  // Auto-link when userEmployeeLink is detected and not yet processed
  useEffect(() => {
    if (userEmployeeLink && step === "accept" && userEmployeeLink.employeeId) {
      void handleLink(userEmployeeLink.employeeId);
    }
  }, [userEmployeeLink, step]); // Added step to dependency array

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div>Loading...</div>
      </div>
    );
  }

  // If user is already authenticated and has a pending employee link
  if (userEmployeeLink && step === "accept") { // Ensure we only show this if we are in the initial 'accept' step
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-center mb-4">Complete Setup</h2>
          <p className="text-center mb-6">
            Welcome <strong>{userEmployeeLink.name}</strong>!<br />
            We found your employee record. Click below to complete your account setup.
          </p>
          <div className="mb-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Role:</strong> {userEmployeeLink.role || "Staff"}<br />
              <strong>Locations:</strong> {userEmployeeLink.locations?.join(", ") || "None assigned"}
            </p>
          </div>
          <button
            onClick={() => void handleLink(userEmployeeLink.employeeId)}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
          >
            Complete Account Setup
          </button>
        </div>
      </div>
    );
  }

  if (!inviteDetails || !inviteDetails.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-center mb-4 text-red-600">Invalid Invite</h2>
          <p className="text-center mb-4">{inviteDetails?.message || "This invite token is not valid or has expired."}</p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-800">
              <strong>Need help?</strong><br />
              Contact your administrator to request a new invite link.
            </p>
          </div>
          <button
            onClick={() => window.location.href = "/"}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (inviteDetails.expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-center mb-4 text-red-600">Invite Expired</h2>
          <p className="text-center">This invite has expired. Please contact your administrator for a new invite.</p>
        </div>
      </div>
    );
  }

  if (inviteDetails.hasAcceptedInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-center mb-4 text-green-600">Already Accepted</h2>
          <p className="text-center mb-6">This invite has already been accepted. Please sign in to continue.</p>
          <button
            onClick={() => window.location.href = "/"}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (step === "accept") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-center mb-4">Accept Invite</h2>
          <p className="text-center mb-6">
            You have been invited to join as <strong>{inviteDetails.name}</strong> ({inviteDetails.email}).
          </p>
          <button
            onClick={handleAccept}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
          >
            Accept Invite
          </button>
        </div>
      </div>
    );
  }

  if (step === "link") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-center mb-4">Sign In Required</h2>
          <p className="text-center mb-6">
            Great! Your invite has been accepted.<br />
            <b>Please sign in with the email address you were invited with:</b>
            <br />
            <span className="inline-block mt-2 mb-2 px-2 py-1 bg-blue-100 text-blue-800 rounded font-mono">
              {employeeData?.email || inviteDetails.email}
            </span>
            <br />
            <span className="text-sm text-gray-500">
              After signing in, you&apos;ll be automatically redirected to complete your setup.
            </span>
          </p>
          <div className="mb-4 p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-green-800">
              ✓ Invite accepted for {employeeData?.email || inviteDetails.email}<br />
              <strong>Role:</strong> {employeeData?.role || "Staff"}<br />
              <strong>Locations:</strong> {(employeeData?.locations || []).join(", ") || "None assigned"}
            </p>
          </div>
          <button
            onClick={() => window.location.href = "/"}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
          >
            Sign In to Complete Setup
          </button>
        </div>
      </div>
    );
  }

  if (step === "complete") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-center mb-4 text-green-600">Setup Complete!</h2>
          <p className="text-center mb-6">
            Your account has been successfully set up. You can now access the application.
          </p>
          <button
            onClick={() => window.location.href = "/"}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700"
          >
            Go to Application
          </button>
        </div>
      </div>
    );
  }

  return null;
}
