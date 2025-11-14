# Architecture Guide for AI Agent

This document outlines the established architectural patterns, file organization, and best practices to be followed when implementing new features or modifying existing ones within this project. This guide is based on the patterns observed and applied during the migration from Convex to Next.js with Neon database and Clerk for authentication.

---

## 1. File Organization and Naming Conventions

The project adheres to a clear separation of concerns, organizing files into logical directories:

*   **API Routes (`src/app/api/`):**
    *   Each API endpoint is defined within its own `route.ts` file, following Next.js App Router conventions.
    *   Routes are grouped by functionality (e.g., `admin/`, `auth/`, `users/`, `employees/`, `locations/`).
    *   Example: `src/app/api/admin/employees/route.ts` (for listing/creating employees), `src/app/api/admin/employees/[id]/route.ts` (for updating/deleting a specific employee).

*   **Library Files (`lib/`):**
    *   Contains reusable utility functions, helpers, and external service integrations.
    *   Examples:
        *   `lib/auth.ts`: Authentication and authorization helpers (e.g., `getCurrentUser`, `requireRole`).
        *   `lib/clerk.ts`: Direct interactions with the Clerk API.
        *   `lib/db-helpers.ts`: Database-related helper functions (e.g., `getUserRoleDoc`, `requireAdminAccess`, `logAudit`).
        *   `lib/emails.ts`: Email sending utilities.
        *   `lib/utils.ts`: General utility functions (e.g., `generateToken`, `generatePassword`).

*   **Database Files (`db/`):**
    *   **Core:**
        *   `db/index.ts`: Initializes the Drizzle ORM client.
        *   `db/schema.ts`: Defines the database schema using Drizzle ORM.
    *   **Mutations (`db/mutations/`):**
        *   Contains functions responsible for writing data to the database (e.g., `createEmployee`, `updateEmployee`, `deleteEmployee`).
        *   These functions often include business logic, validation, and audit logging.
    *   **Queries (`db/queries/`):**
        *   Contains functions responsible for reading data from the database (e.g., `getUserByClerkId`, `listEmployees`).
        *   These functions should primarily focus on data retrieval.
    *   **Note on `db/queries/users.ts`:** Currently, `createUser`, `updateUser`, and `deleteUser` are located here. While this deviates from the `db/mutations` pattern, it's an existing structure. For new user-related mutations, prefer creating a `db/mutations/users.ts` file.

---

## 2. Authentication and Authorization

*   **Clerk Integration:** Clerk is used for primary authentication and user management.
*   **`lib/auth.ts`:** Provides high-level functions (`getCurrentUser`, `requireAuth`, `requireRole`) to abstract Clerk's `auth()` and integrate with local user/role data.
*   **`lib/clerk.ts`:** Encapsulates direct calls to `@clerk/nextjs/server` functions for managing Clerk users (e.g., `getClerkUser`, `createClerkUser`, `updateClerkUser`, `updateClerkMetadata`, `deleteClerkUser`).
*   **Role-Based Access Control (RBAC):**
    *   Roles (`admin`, `supervisor`, `staff`) are stored in the `roles` table and as `publicMetadata` in Clerk.
    *   `lib/db-helpers.ts` provides `getUserRoleDoc` and `requireAdminAccess` to enforce role-based permissions.
    *   API routes should use `requireRole(['admin'])` or similar checks from `lib/auth.ts` to protect endpoints.

---

## 3. Database Interactions (Drizzle ORM)

*   **Separation of Concerns:** Database read operations are in `db/queries/` and write operations are in `db/mutations/`.
*   **Drizzle ORM:** All database interactions should use Drizzle ORM.
*   **Schema Definition:** The database schema is defined in `db/schema.ts`.
*   **Timestamps:** `createdAt` and `updatedAt` fields should be `new Date()` objects.
*   **Optional Fields:** Handle `null` or `undefined` values for optional fields consistently (e.g., `assignedDeviceId || undefined`).

---

## 4. Clerk Webhook Handling

*   **`src/app/api/auth/webhook/route.ts`:** This route is the entry point for Clerk webhooks.
*   **Event-Driven Updates:** It processes `user.created`, `user.updated`, and `user.deleted` events.
*   **Database Sync:** Webhook handlers (`handleUserCreated`, `handleUserUpdated`, `handleUserDeleted`) are responsible for syncing Clerk user data with the local `users`, `employees`, and `roles` tables using functions from `db/queries/users.ts` and `db/mutations/employees.ts`.
*   **Robustness:** Webhook handlers should be resilient to errors and log failures.

---

## 5. Error Handling and Logging

*   **API Responses:** Use `NextResponse.json({error: 'message'}, {status: code})` for consistent error responses in API routes.
*   **Audit Logging:**
    *   The `logAudit` function from `lib/db-helpers.ts` should be used to record significant events (e.g., access denied, employee creation/update/deletion).
    *   Ensure `clerkUserId`, `event`, `details`, `deviceId`, and `location` are provided for audit logs.

---

## 6. Helper Functions and Utilities

*   **`lib/db-helpers.ts`:** Centralizes database-related helper functions, including `getUserRoleDoc`, `requireCareAccess`, `requireAdminAccess`, and `logAudit`.
*   **`lib/utils.ts`:** Contains general utility functions like `generateToken` and `generatePassword`.
*   **`lib/emails.ts`:** Provides functions for sending various types of emails (e.g., `sendInviteEmail`, `sendWelcomeEmailWithCredentials`).

---

## Summary of Key Patterns:

*   **Modular Structure:** Clear separation of API routes, library functions, and database logic.
*   **Clerk-centric Authentication:** Clerk is the source of truth for user identity, with local database syncing via webhooks and direct API calls.
*   **Role-Based Access Control:** Enforced at the API layer using `lib/auth.ts` and `lib/db-helpers.ts`.
*   **Drizzle ORM for DB:** Consistent use of Drizzle for all database operations, with mutations and queries separated.
*   **Comprehensive Logging:** Audit logs for critical actions and error handling in API routes.
*   **Reusable Helpers:** Common logic extracted into `lib/` files.

By adhering to these patterns, future development will maintain consistency, readability, and robustness across the application.
