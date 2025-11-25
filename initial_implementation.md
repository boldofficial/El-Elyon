# Component Migration Instructions for AI Agent

This document provides instructions for migrating and updating React components located in the `src/components/` directory. The primary goal is to transition these components from any legacy Convex-related patterns to the newly established Next.js API routes, Drizzle ORM, and Clerk authentication patterns, while strictly maintaining their existing design and visual styles.

**Before proceeding with any implementation, thoroughly review the following documents for essential context:**

*   **`architecture.md`**: Understand the overall architectural patterns, file organization, authentication/authorization mechanisms, and database interaction guidelines.
*   **`api_and_db_summary.md`**: Familiarize yourself with the available API routes, library functions, and database query/mutation functions that should now be utilized.

---

## Task Overview

The task involves reviewing each component in `src/components/` and updating its internal logic to align with the new architecture. This includes:

1.  **Replacing Convex-specific calls:** Identify and replace any direct calls to Convex functions (e.g., `useQuery`, `useMutation`, `ctx.db`, `ctx.auth`) with appropriate calls to the new Next.js API routes or direct database functions from `db/queries/` and `db/mutations/`.
2.  **Utilizing `lib/` helpers:** Leverage functions from `lib/auth.ts`, `lib/clerk.ts`, and `lib/db-helpers.ts` for authentication, Clerk API interactions, and common database operations.
3.  **Maintaining UI/UX:** Ensure that all visual aspects, styling, and user experience remain identical to the original implementation. No design changes are permitted unless explicitly stated.
4.  **Error Handling:** Implement robust error handling using `try-catch` blocks and provide meaningful feedback to the user where appropriate, consistent with existing patterns.
5.  **Authentication/Authorization:** Ensure components that require authentication or specific roles correctly use `lib/auth.ts` functions (e.g., `getCurrentUser`, `requireRole`) to gate access or fetch user-specific data.

---

## List of Components to Update

Below is a list of all components found in `src/components/`, categorized for clarity. Each component should be reviewed and updated according to the guidelines above.

### Admin Components
*   `src/components/admin/AdminAlertSchedule.tsx` (UPDATED)
*   `src/components/admin/AdminDashboard.tsx` (UPDATED)
*   `src/components/admin/AdminDeviceBadge.tsx` (UPDATED)
*   `src/components/admin/AdminPortal.tsx` (UPDATED)
*   `src/components/admin/BootstrapAdmin.tsx` (UPDATED)
*   `src/components/admin/DatabaseCleanup.tsx` (UPDATED)
*   `src/components/admin/DataCleanupWorkspace.tsx` (UPDATED)
*   `src/components/admin/DeviceManagementWorkspace.tsx` (UPDATED)
*   `src/components/admin/EmployeeInviteAcceptance.tsx` (UPDATED)
*   `src/components/admin/EmployeeWorkspace.tsx` (UPDATED)
*   `src/components/admin/FireEvacManagement.tsx` (UPDATED)
*   `src/components/admin/FirstAdminSetup.tsx` (UPDATED)
*   `src/components/admin/ImprovedEmployeeCreation.tsx` (UPDATED)
*   `src/components/admin/InviteAcceptance.tsx` (UPDATED)
*   `src/components/admin/ISPWorkspace.tsx`
*   `src/components/admin/LocationBanner.tsx`
*   `src/components/admin/LocationsWorkspace.tsx`
*   `src/components/admin/PeopleWorkspace.tsx`
*   `src/components/admin/SecuritySettings.tsx`
*   `src/components/admin/SettingsWorkspace.tsx`
*   `src/components/admin/SystemSettings.tsx`

### Authentication Components
*   `src/components/auth/AuthDiagnostic.tsx` (UPDATED)
*   `src/components/auth/ForgotPasswordPage.tsx` (UPDATED)
*   `src/components/auth/ResetPasswordPage.tsx` (UPDATED)
*   `src/components/auth/SignOutButton.tsx`
*   `src/components/auth/SignInForm.tsx` (UPDATED)

### Care Components
*   `src/components/care/CareLogsWorkspace.tsx` (UPDATED)
*   `src/components/care/CarePortal.tsx` (UPDATED)
*   `src/components/care/CareProfileWorkspace.tsx` (UPDATED)
*   `src/components/care/CareResidentsWorkspace.tsx` (UPDATED)
*   `src/components/care/CareShiftWorkspace.tsx` (UPDATED)
*   `src/components/care/ResidentCase.tsx` (UPDATED)
*   `src/components/care/ResidentOnboardingForm.tsx` (UPDATED)
*   `src/components/care/ResidentsWorkspace.tsx` (UPDATED)

### Compliance Components
*   `src/components/compliance/ComplianceAlerts.tsx`
*   `src/components/compliance/ComplianceSettings.tsx`
*   `src/components/compliance/ComplianceWorkspace.tsx`

### Guardian Components
*   `src/components/guardian/CareShiftWorkspace.tsx`
*   `src/components/guardian/GuardianChecklistPublic.tsx` (UPDATED)
*   `src/components/guardian/GuardianChecklistWorkspace.tsx`
*   `src/components/guardian/GuardianOnboardingForm.tsx`
*   `src/components/guardian/GuardiansWorkspace.tsx`

### Kiosk Components
*   `src/components/kiosk/KioskManagement.tsx`
*   `src/components/kiosk/KioskPairingScreen.tsx`
*   `src/components/kiosk/KioskSession.tsx`

### Shared Components
*   `src/components/shared/AccessControl.tsx` (UPDATED)
*   `src/components/shared/AutoLock.tsx`
*   `src/components/shared/pass.tsx`
*   `src/components/shared/PendingPage.tsx` (UPDATED)
*   `src/components/shared/QuickSignOut.tsx`
*   `src/components/shared/SelfieCapture.tsx`
*   `src/components/shared/Sidebar.tsx`

### Supervisor Components
*   `src/components/supervisor/SupervisorComplianceWorkspace.tsx`
*   `src/components/supervisor/SupervisorPortal.tsx`
*   `src/components/supervisor/SupervisorTeamWorkspace.tsx`

---

**Instructions for AI Agent:**

For each component listed above:
1.  Read the component file to understand its current implementation and dependencies.
2.  Identify any code that interacts with the old Convex backend.
3.  Refactor the component to use the new Next.js API routes (e.g., `fetch('/api/...')`) or direct calls to `db/queries/` and `db/mutations/` functions, as appropriate.
4.  Ensure that authentication and authorization checks are correctly implemented using `lib/auth.ts`.
5.  Verify that the component's visual design and functionality remain unchanged.
6.  Add comments where necessary to explain significant changes or new architectural patterns.
7.  After updating a component, ensure it compiles without errors and functions as expected.
