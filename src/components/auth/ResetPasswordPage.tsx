/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const resetPasswordMutation = useMutation(api.passwordReset.resetPassword);
  const verifyTokenMutation = useMutation(api.passwordReset.verifyResetToken);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    // Get the full URL and parse it manually
    const fullUrl = window.location.href;
    const url = new URL(fullUrl);
    const emailParam = (url.searchParams.get("email") || "").trim().toLowerCase();
    const codeParam = (url.searchParams.get("code") || "").trim();
    
    console.log("Full URL:", fullUrl);
    console.log("Search params:", url.search);
    console.log("Email param:", emailParam);
    console.log("Code param:", codeParam);
    
    setEmail(emailParam);
    setCode(codeParam);

    // Verify the token if we have both email and code
    if (emailParam && codeParam) {
      verifyTokenMutation({ email: emailParam, token: codeParam })
        .then((result) => {
          if (result.valid) {
            setTokenValid(true);
            setUserName(result.userName || "");
          } else {
            setTokenValid(false);
            toast.error(result.message || "Invalid reset link");
          }
        })
        .catch((err) => {
          setTokenValid(false);
          toast.error("Failed to verify reset link");
          console.error("Token verification error:", err);
        });
    } else {
      setTokenValid(false);
    }
  }, [verifyTokenMutation]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !code) {
      toast.error("Invalid reset link. Please request a new one.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await resetPasswordMutation({
        email,
        token: code,
        newPassword: password,
      });
      
      toast.success("Password reset successfully! Redirecting to sign in...");
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch (err: any) {
      toast.error(err?.message ?? "Reset failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Show loading state while verifying token
  if (tokenValid === null) {
    return (
      <div className="w-full min-h-screen bg-[rgb(248_250_252)] px-4 py-10 flex items-center justify-center">
        <div className="mx-auto w-full max-w-[440px] bg-white/95 border border-gray-200 rounded-2xl shadow-lg p-6 sm:p-7 md:p-8">
          <div className="text-center">
            <div className="mb-4 text-5xl">⏳</div>
            <h1 className="text-2xl font-bold mb-4">Verifying Reset Link</h1>
            <p className="text-gray-600 mb-4">
              Please wait while we verify your password reset link...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!tokenValid || !code || !email) {
    return (
      <div className="w-full min-h-screen bg-[rgb(248_250_252)] px-4 py-10 flex items-center justify-center">
        <div className="mx-auto w-full max-w-[440px] bg-white/95 border border-gray-200 rounded-2xl shadow-lg p-6 sm:p-7 md:p-8">
          <div className="text-center">
            <div className="mb-4 text-5xl">❌</div>
            <h1 className="text-2xl font-bold mb-4">Invalid Reset Link</h1>
            <p className="text-gray-600 mb-4">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <p className="text-xs text-gray-500 mb-6">
              Debug: Email={email || "missing"}, Code={code || "missing"}
            </p>
            <a
              href="/forgot"
              className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Request New Reset Link
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[rgb(248_250_252)] px-4 py-10 flex items-center justify-center">
      <div className="mx-auto w-full max-w-[440px] sm:max-w-[480px] md:max-w-[520px] bg-white/95 border border-gray-200 rounded-2xl shadow-lg p-6 sm:p-7 md:p-8">
        <div className="mb-6 text-center">
          <div className="text-3xl font-bold tracking-tight text-black">
            El-Elyon <span className="text-blue-500">Properties LLC</span>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-center mb-2">Reset Your Password</h1>
          <p className="text-gray-600 text-center text-sm">
            {userName ? `Hello ${userName}, enter` : "Enter"} your new password for {email}.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="newPassword"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              New Password
            </label>
            <input
              id="newPassword"
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
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
            {submitting ? "Resetting..." : "Reset Password"}
          </button>

          <div className="text-center">
            <a
              href="/"
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Back to Sign In
            </a>
          </div>
        </form>

        <div className="pt-6 text-center text-xs text-gray-500">
          Powered by <span className="font-medium">Bold Ideas Innovations Ltd.</span>
        </div>
      </div>
    </div>
  );
}
