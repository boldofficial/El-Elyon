// import { useState } from "react";
// import { useMutation } from "convex/react";
// import { api } from "../../convex/_generated/api";
// import { toast } from "sonner";

// export default function BootstrapAdmin() {
//   const [formData, setFormData] = useState({
//     name: "",
//     email: "",
//     password: "",
//     confirmPassword: "",
//   });
//   const [isSubmitting, setIsSubmitting] = useState(false);

//   const bootstrapFirstAdmin = useMutation(api.auth.bootstrapFirstAdmin);

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();

//     if (formData.password !== formData.confirmPassword) {
//       toast.error("Passwords do not match");
//       return;
//     }

//     if (formData.password.length < 8) {
//       toast.error("Password must be at least 8 characters");
//       return;
//     }

//     setIsSubmitting(true);

//     try {
//       await bootstrapFirstAdmin({
//         name: formData.name,
//         email: formData.email,
//         password: formData.password,
//       });

//       toast.success("Admin account created successfully! Please sign in.");
      
//       // Reload the page to show the sign-in form
//       setTimeout(() => {
//         window.location.reload();
//       }, 1500);
//     } catch (error: any) {
//       toast.error(error.message || "Failed to create admin account");
//       setIsSubmitting(false);
//     }
//   };

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
//       <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8">
//         <div className="text-center mb-8">
//           <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
//             <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
//             </svg>
//           </div>
//           <h1 className="text-2xl font-bold text-gray-900 mb-2">
//             Welcome to Ezer
//           </h1>
//           <p className="text-gray-600">
//             Create your first administrator account to get started
//           </p>
//         </div>

//         <form onSubmit={handleSubmit} className="space-y-4">
//           <div>
//             <label className="block text-sm font-medium text-gray-700 mb-2">
//               Full Name
//             </label>
//             <input
//               type="text"
//               required
//               value={formData.name}
//               onChange={(e) => setFormData({ ...formData, name: e.target.value })}
//               className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//               placeholder="John Doe"
//             />
//           </div>

//           <div>
//             <label className="block text-sm font-medium text-gray-700 mb-2">
//               Email Address
//             </label>
//             <input
//               type="email"
//               required
//               value={formData.email}
//               onChange={(e) => setFormData({ ...formData, email: e.target.value })}
//               className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//               placeholder="admin@example.com"
//             />
//           </div>

//           <div>
//             <label className="block text-sm font-medium text-gray-700 mb-2">
//               Password
//             </label>
//             <input
//               type="password"
//               required
//               value={formData.password}
//               onChange={(e) => setFormData({ ...formData, password: e.target.value })}
//               className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//               placeholder="••••••••"
//               minLength={8}
//             />
//             <p className="text-xs text-gray-500 mt-1">
//               Minimum 8 characters
//             </p>
//           </div>

//           <div>
//             <label className="block text-sm font-medium text-gray-700 mb-2">
//               Confirm Password
//             </label>
//             <input
//               type="password"
//               required
//               value={formData.confirmPassword}
//               onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
//               className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//               placeholder="••••••••"
//             />
//           </div>

//           <button
//             type="submit"
//             disabled={isSubmitting}
//             className="w-full bg-blue-600 text-white py-3 rounded-md font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
//           >
//             {isSubmitting ? "Creating Account..." : "Create Admin Account"}
//           </button>
//         </form>

//         <div className="mt-6 p-4 bg-blue-50 rounded-md">
//           <p className="text-xs text-blue-800">
//             <strong>Note:</strong> This screen only appears when no administrator exists. 
//             After creating the first admin, you'll be able to sign in and invite other users.
//           </p>
//         </div>
//       </div>
//     </div>
//   );
// }


// //// 

// "use client";
// import { SignIn } from "@clerk/clerk-react";

// export function SignInForm() {
//   return (
//     <div
//       className="
//         w-full min-h-screen
//         bg-[rgb(248_250_252)] dark:bg-neutral-950
//         px-4 py-10 flex items-center justify-center
//       "
//     >
//       {/* Centered, reduced-width container */}
//       <div
//         className="
//           mx-auto w-full
//           max-w-[440px] sm:max-w-[480px] md:max-w-[520px] lg:max-w-[560px]
//           bg-white/95 dark:bg-neutral-900/95
//           border border-gray-200 dark:border-neutral-800
//           rounded-2xl shadow-lg
//           p-6 sm:p-7 md:p-8
//         "
//       >
//         {/* Logo Section */}
//         <div className="flex justify-center mb-4">
//           <img 
//             src="/logo.png" 
//             alt="El-Elyon Properties LLC Logo" 
//             className="h-16 w-auto"
//             onError={(e) => {
//               // Fallback to text if logo image doesn't exist
//               e.currentTarget.style.display = 'none';
//               e.currentTarget.nextElementSibling?.classList.remove('hidden');
//             }}
//           />
//           <div className="text-3xl font-bold hidden">
//             <span className="text-black">El-Elyon</span>
//             <span className="text-blue-600"> Properties LLC</span>
//           </div>
//         </div>

//         <SignIn routing="hash" signUpUrl="/sign-up" />

//         {/* Footer */}
//         <div className="mt-6 text-center">
//           <p className="text-xs text-gray-500">
//             powered by <span className="font-semibold text-gray-700">Bold Ideas Innovations Ltd</span>
//           </p>
//         </div>
//       </div>
//     </div>
//   );
// }


// /////

// // src/BootstrapAdminPage.tsx

// 'use client';
// import {useQuery, useAction} from 'convex/react';
// import {api} from '../convex/_generated/api';
// import {useState} from 'react';
// import {toast} from 'sonner';
// // import {useRouter} from 'next/navigation'; // Removed as this is not a Next.js project

// export function BootstrapAdminPage() {
//   const needsBootstrap = useQuery(api.auth.needsBootstrap);
//   const bootstrapFirstAdmin = useAction(api.auth.bootstrapFirstAdmin);
//   // const router = useRouter(); // Removed as this is not a Next.js project

//   const [formData, setFormData] = useState({
//     name: '',
//     email: '',
//     password: '',
//     confirmPassword: '',
//   });
//   const [submitting, setSubmitting] = useState(false);

//   // Still loading
//   if (needsBootstrap === undefined) {
//     return (
//       <div className="w-full min-h-screen bg-[rgb(248_250_252)] dark:bg-neutral-950 flex items-center justify-center">
//         <div className="text-center">
//           <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
//           <p className="mt-4 text-gray-600 dark:text-gray-400">
//             Checking system status...
//           </p>
//         </div>
//       </div>
//     );
//   }

//   // Show bootstrap form (always, as per user request to create another admin)
//   // The needsBootstrap query is still used for its loading state, but the redirect is removed.
//   const handleSubmit = async () => {
//     if (formData.password !== formData.confirmPassword) {
//       toast.error('Passwords do not match');
//       return;
//     }

//     if (formData.password.length < 8) {
//       toast.error('Password must be at least 8 characters');
//       return;
//     }

//     setSubmitting(true);

//     try {
//       const result = await bootstrapFirstAdmin({
//         name: formData.name.trim(),
//         email: formData.email.trim().toLowerCase(),
//         password: formData.password,
//       });

//       if (result.ok) {
//         toast.success('Admin account created successfully!');
//         setTimeout(() => {
//           window.location.href = '/signin';
//         }, 1500);
//       } else {
//         toast.error(result.message || 'Failed to create admin account');
//         setSubmitting(false);
//       }
//     } catch (error: any) {
//       console.error('Bootstrap error:', error);
//       toast.error(error.message || 'An error occurred');
//       setSubmitting(false);
//     }
//   };

//   return (
//     <div className="w-full min-h-screen bg-[rgb(248_250_252)] dark:bg-neutral-950 px-4 py-10 flex items-center justify-center">
//       <div className="mx-auto w-full max-w-[520px] bg-white/95 dark:bg-neutral-900/95 border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-lg p-8">
//         {/* Header */}
//         <div className="mb-6 text-center">
//           <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
//             <svg
//               className="w-8 h-8 text-blue-600 dark:text-blue-400"
//               fill="none"
//               stroke="currentColor"
//               viewBox="0 0 24 24">
//               <path
//                 strokeLinecap="round"
//                 strokeLinejoin="round"
//                 strokeWidth={2}
//                 d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
//               />
//             </svg>
//           </div>
//           <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
//             Create Administrator Account
//           </h1>
//           <p className="text-sm text-gray-600 dark:text-gray-400">
//             No admin exists yet. Create the first administrator account to get
//             started.
//           </p>
//         </div>

//         <div className="flex flex-col gap-4">
//           <div>
//             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
//               Full Name
//             </label>
//             <input
//               type="text"
//               value={formData.name}
//               onChange={(e) => setFormData({...formData, name: e.target.value})}
//               className="w-full rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3.5 py-2.5 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
//               placeholder="John Doe"
//               onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
//             />
//           </div>

//           <div>
//             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
//               Email Address
//             </label>
//             <input
//               type="email"
//               value={formData.email}
//               onChange={(e) =>
//                 setFormData({...formData, email: e.target.value})
//               }
//               className="w-full rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3.5 py-2.5 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
//               placeholder="admin@example.com"
//               autoComplete="username"
//               onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
//             />
//           </div>

//           <div>
//             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
//               Password
//             </label>
//             <input
//               type="password"
//               value={formData.password}
//               onChange={(e) =>
//                 setFormData({...formData, password: e.target.value})
//               }
//               className="w-full rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3.5 py-2.5 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
//               placeholder="Min. 8 characters"
//               autoComplete="new-password"
//               onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
//             />
//           </div>

//           <div>
//             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
//               Confirm Password
//             </label>
//             <input
//               type="password"
//               value={formData.confirmPassword}
//               onChange={(e) =>
//                 setFormData({...formData, confirmPassword: e.target.value})
//               }
//               className="w-full rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3.5 py-2.5 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
//               placeholder="Re-enter password"
//               autoComplete="new-password"
//               onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
//             />
//           </div>

//           <button
//             onClick={handleSubmit}
//             disabled={submitting}
//             className="w-full mt-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-lg transition-colors">
//             {submitting ? 'Creating Account...' : 'Create Admin Account'}
//           </button>
//         </div>

//         <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
//           <div className="flex gap-3">
//             <svg
//               className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
//               fill="none"
//               stroke="currentColor"
//               viewBox="0 0 24 24">
//               <path
//                 strokeLinecap="round"
//                 strokeLinejoin="round"
//                 strokeWidth={2}
//                 d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
//               />
//             </svg>
//             <div>
//               <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
//                 Security Notice
//               </p>
//               <p className="text-xs text-amber-700 dark:text-amber-300">
//                 This page will only work once. After creating the first admin,
//                 you'll need to use the regular sign-in page.
//               </p>
//             </div>
//           </div>
//         </div>

//         <div className="pt-6 text-center text-xs text-gray-500">
//           Powered by{' '}
//           <span className="font-medium">Bold Ideas Innovations Ltd.</span>
//         </div>
//       </div>
//     </div>
//   );
// }
