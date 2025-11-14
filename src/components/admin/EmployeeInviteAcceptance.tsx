import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

export default function EmployeeInviteAcceptance({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const inviteInfo = useQuery(api.employeesImproved.verifyInviteToken, { token });
  const acceptInvite = useMutation(api.employeesImproved.acceptInviteAndSetPassword);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      await acceptInvite({
        inviteToken: token,
        password,
      });
      
      toast.success("Account created! Redirecting to sign in...");
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch (err: any) {
      toast.error(err.message || "Failed to accept invite");
    } finally {
      setSubmitting(false);
    }
  }

  if (!inviteInfo) {
    return (
      <div className="w-full min-h-screen bg-[rgb(248_250_252)] px-4 py-10 flex items-center justify-center">
        <div className="mx-auto w-full max-w-[440px] bg-white/95 border border-gray-200 rounded-2xl shadow-lg p-8">
          <div className="text-center">
            <div className="mb-4 text-5xl">⏳</div>
            <p className="text-gray-600">Loading invite...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!inviteInfo.valid) {
    return (
      <div className="w-full min-h-screen bg-[rgb(248_250_252)] px-4 py-10 flex items-center justify-center">
        <div className="mx-auto w-full max-w-[440px] bg-white/95 border border-gray-200 rounded-2xl shadow-lg p-8">
          <div className="text-center">
            <div className="mb-4 text-5xl">❌</div>
            <h1 className="text-2xl font-bold mb-4">Invalid Invite</h1>
            <p className="text-gray-600 mb-6">{inviteInfo.message}</p>
            <a
              href="/"
              className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go to Sign In
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[rgb(248_250_252)] px-4 py-10 flex items-center justify-center">
      <div className="mx-auto w-full max-w-[480px] bg-white/95 border border-gray-200 rounded-2xl shadow-lg p-8">
        <div className="mb-6 text-center">
          <div className="text-3xl font-bold tracking-tight text-black">
            El-Elyon <span className="text-blue-500">Properties LLC</span>
          </div>
        </div>

        <div className="mb-6 text-center">
          <div className="text-4xl mb-4">👋</div>
          <h1 className="text-2xl font-bold mb-2">Welcome, {inviteInfo.employeeName}!</h1>
          <p className="text-gray-600 text-sm">
            Set your password to complete your account setup
          </p>
          <div className="mt-3 inline-block px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
            {inviteInfo.role === "admin" ? "Administrator" : 
             inviteInfo.role === "supervisor" ? "Supervisor" : "Care Staff"}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={inviteInfo.employeeEmail || ""}
              disabled
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3.5 py-2.5 text-gray-600"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Create Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              minLength={8}
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              minLength={8}
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center rounded-lg px-4 py-2.5 bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Creating Account..." : "Create Account & Sign In"}
          </button>
        </form>

        <div className="pt-6 text-center text-xs text-gray-500">
          Powered by <span className="font-medium">Bold Ideas Innovations Ltd.</span>
        </div>
      </div>
    </div>
  );
}
