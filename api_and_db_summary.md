# API Routes, Library Files, and Database Files Summary

This document provides a comprehensive list of API routes, library files, and database-related files within the application, categorized for clarity.

---

## 1. API Routes (`src/app/api/`)

### Access Management
*   `src/app/api/access/check/route.ts`
*   `src/app/api/access/log/route.ts`
*   `src/app/api/access/session/route.ts`

### Admin Operations
*   `src/app/api/admin/cleanup-orphaned-users/route.ts`
*   `src/app/api/admin/compliance/export-list/route.ts`
*   `src/app/api/admin/compliance/resend-guardian-link/route.ts`
*   `src/app/api/admin/compliance/send-reminders/route.ts`
*   `src/app/api/admin/create-first/route.ts`
*   `src/app/api/admin/employees/route.ts`
*   `src/app/api/admin/employees/[id]/route.ts`
*   `src/app/api/admin/employees/accept-invite/route.ts`
*   `src/app/api/admin/employees/available-locations/route.ts`
*   `src/app/api/admin/employees/check-device-authorization/route.ts`
*   `src/app/api/admin/employees/check-user-link/route.ts`
*   `src/app/api/admin/employees/generate-invite-link/route.ts`
*   `src/app/api/admin/employees/has-admin/route.ts`
*   `src/app/api/admin/employees/invite-details/route.ts`
*   `src/app/api/admin/employees/invite-link/route.ts`
*   `src/app/api/admin/employees/link-user/route.ts`
*   `src/app/api/admin/force-create/route.ts`
*   `src/app/api/admin/has-admin/route.ts`
*   `src/app/api/admin/kiosks/list/route.ts`
*   `src/app/api/admin/kiosks/seed/route.ts`
*   `src/app/api/admin/locations/route.ts`
*   `src/app/api/admin/locations/create/route.ts`
*   `src/app/api/admin/locations/delete/route.ts`
*   `src/app/api/admin/locations/sync/route.ts`
*   `src/app/api/admin/locations/update/route.ts`
*   `src/app/api/admin/logs/recent/route.ts`

### Authentication
*   `src/app/api/auth/sync/route.ts`
*   `src/app/api/auth/webhook/route.ts`

### Device Management
*   `src/app/api/devices/check/route.ts`

### Guardian Checklists
*   `src/app/api/guardian-checklists/acknowledge/route.ts`
*   `src/app/api/guardian-checklists/by-token/route.ts`
*   `src/app/api/guardian-checklists/submit/route.ts`

### Internal Compliance
*   `src/app/api/internal/compliance/generate-alerts/route.ts`
*   `src/app/api/internal/compliance/send-alert-emails/route.ts`
*   `src/app/api/internal/compliance/send-guardian-checklist-email/route.ts`
*   `src/app/api/internal/compliance/send-reminder-emails/route.ts`

### Kiosk Operations
*   `src/app/api/kiosk/by-device/route.ts`
*   `src/app/api/kiosk/update-last-seen/route.ts`

### Resident Management
*   `src/app/api/residents/route.ts`

### Application Settings
*   `src/app/api/settings/app/route.ts`

### Shift Management
*   `src/app/api/shifts/clock-in/route.ts`
*   `src/app/api/shifts/clock-out/route.ts`
*   `src/app/api/shifts/current/route.ts`
*   `src/app/api/shifts/generate-selfie-upload-url/route.ts`

### User Management
*   `src/app/api/users/current/route.ts`
*   `src/app/api/users/role/route.ts`
*   `src/app/api/users/update-profile/route.ts`

---

## 2. Library Files (`lib/`)

*   `lib/auth.ts`
*   `lib/clerk.ts`
*   `lib/db-helpers.ts`
*   `lib/device.ts`
*   `lib/emails.ts`
*   `lib/utils.ts`

---

## 3. Database Files (`db/`)

### Core Database Files
*   `db/index.ts`
*   `db/schema.ts`

### Mutations
*   `db/mutations/audit.ts`
*   `db/mutations/care.ts`
*   `db/mutations/cleanup.ts`
*   `db/mutations/compliance.ts`
*   `db/mutations/employees.ts`

### Queries
*   `db/queries/care.ts`
*   `db/queries/compliance.ts`
*   `db/queries/employees.ts`
*   `db/queries/roles.ts`
*   `db/queries/users.ts`
