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

### Top-Level Components
*   `src/components/GuardianChecklistPublic.tsx`

### Admin Components
*   `src/components/admin/AdminPortal.tsx`

### Authentication Components
*   `src/components/auth/SignOutButton.tsx`

### Care Components
*   `src/components/care/CarePortal.tsx`

### Kiosk Components
*   `src/components/kiosk/KioskSession.tsx`

### Shared Components
*   `src/components/shared/AccessControl.tsx`
*   `src/components/shared/PendingPage.tsx`

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
