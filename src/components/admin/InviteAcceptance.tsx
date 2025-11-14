import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export default function InviteAcceptance({ token }: { token: string }) {
  const [step, setStep] = useState<"accept" | "link" | "complete">("accept");
  const [employeeData, setEmployeeData] = useState<any>(null);

  const inviteDetails = useQuery(api.employees.getInviteDetails, { token });
  const userEmployeeLink = useQuery(api.employees.checkUserEmployeeLink);
  const acceptInvite = useMutation(api.employees.acceptInvite);
  const linkUserToEmployee = useMutation(api.employees.linkUserToEmployee);

  console.log("InviteAcceptance - Token:", token);
  console.log("InviteAcceptance - Invite Details:", inviteDetails);
  console.log("InviteAcceptance - User Employee Link:", userEmployeeLink);

  const handleAccept = async () => {
    try {
      console.log("Accepting invite with token:", token);
      const result = await acceptInvite({ token });
      console.log("Accept invite result:", result);
      setEmployeeData(result);
      setStep("link");
    } catch (err) {
      console.error("Failed to accept invite:", err);
      alert("Failed to accept invite: " + (err as Error).message);
    }
  };

  const handleLink = async () => {
    if (!employeeData?.employeeId) return;

    try {
      await linkUserToEmployee({ employeeId: employeeData.employeeId });
      setStep("complete");
    } catch (err) {
      alert("Failed to link account: " + (err as Error).message);
    }
  };

  const handleAutoLink = async () => {
    if (!userEmployeeLink?.employeeId) return;

    try {
      await linkUserToEmployee({ employeeId: userEmployeeLink.employeeId });
      setStep("complete");
      // Reload page after a short delay to refresh session
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      alert("Failed to link account: " + (err as Error).message);
    }
  };

  // Auto-link when userEmployeeLink is detected
  useEffect(() => {
    if (userEmployeeLink && step === "accept") {
      handleAutoLink();
    }
  }, [userEmployeeLink]);

  // If user is already authenticated and has a pending employee link
  if (userEmployeeLink) {
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
              <strong>Locations:</strong> {userEmployeeLink.locations.join(", ") || "None assigned"}
            </p>
          </div>
          <button
            onClick={handleAutoLink}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
          >
            Complete Account Setup
          </button>
        </div>
      </div>
    );
  }

  if (inviteDetails === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div>Loading...</div>
      </div>
    );
  }

  if (!inviteDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-center mb-4 text-red-600">Invalid Invite</h2>
          <p className="text-center mb-4">This invite token is not valid or has expired.</p>
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
              After signing in, you'll be automatically redirected to complete your setup.
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