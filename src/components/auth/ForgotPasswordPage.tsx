/* eslint-disable @typescript-eslint/no-misused-promises */
import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const sendEmail = useAction(api.passwordResetEmail.sendPasswordResetEmail);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    setIsSubmitting(true);

    try {
      // Only call the email action, which will generate the token and user info.
      await sendEmail({ email: email.trim() });

      setIsSubmitted(true);
      toast.success("Password reset instructions sent!");
    } catch (error: any) {
      toast.error("Failed to send reset email. Please try again.");
      console.error("Password reset error:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="w-full min-h-screen bg-[rgb(248_250_252)] px-4 py-10 flex items-center justify-center">
        <div className="mx-auto w-full max-w-[440px] sm:max-w-[480px] md:max-w-[520px] bg-white/95 border border-gray-200 rounded-2xl shadow-lg p-6 sm:p-7 md:p-8">
          <div className="text-center">
            <div className="mb-4 text-5xl">✉️</div>
            <h1 className="text-2xl font-bold mb-4">Check Your Email</h1>
            <p className="text-gray-600 mb-6">
              If an account exists with <strong>{email}</strong>, you will receive password reset instructions shortly.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              The reset link will expire in 1 hour.
            </p>
            <a
              href="/"
              className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Sign In
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[rgb(248_250_252)] px-4 py-10 flex items-center justify-center">
      <div className="mx-auto w-full max-w-[440px] sm:max-w-[480px] md:max-w-[520px] bg-white/95 border border-gray-200 rounded-2xl shadow-lg p-6 sm:p-7 md:p-8">
        {/* Wordmark */}
        <div className="mb-6 text-center">
          <div className="text-3xl font-bold tracking-tight text-black">
            El-Elyon <span className="text-blue-500">Properties LLC</span>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-center mb-2">Forgot Password?</h1>
          <p className="text-gray-600 text-center text-sm">
            Enter your email address and we'll send you instructions to reset your password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              disabled={isSubmitting}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center rounded-lg px-4 py-2.5 bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Sending..." : "Send Reset Instructions"}
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

        {/* Footer */}
        <div className="pt-6 text-center text-xs text-gray-500">
          Powered by <span className="font-medium">Bold Ideas Innovations Ltd.</span>
        </div>
      </div>
    </div>
  );
}
