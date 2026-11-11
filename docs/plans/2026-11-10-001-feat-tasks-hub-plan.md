---
title: "feat: Tasks hub"
type: feat
date: 2026-11-10
---

# feat: Tasks hub

## Summary

A place in the app to assign and track work that falls **outside the normal daily rhythm** of a home: an appointment to book, a medication refill to chase, a document to renew, an occasional critical chore. Routine daily duties are already covered elsewhere in the app and are not what this is for.

Staff, supervisors and admins can create tasks for their home and tick them off. A task that passes its due date without being done shows as a conspicuous banner on the care app home page until someone deals with it.

This is the second half of the "custom logs + tasks hub" design from 2026-09-17. The first half shipped as the hand-built carb log and blood sugar log. Admin-defined log sheets remain a separate, later piece of work.

## Locked decisions

From 2026-09-17, reconfirmed 2026-11-10:

1. **Who creates tasks:** admins, supervisors and staff. Supervisors and staff only for their own locations; admins anywhere.
2. **Reminders are day-level.** A task is "due today" or "overdue". No hourly reminders.

Decided 2026-11-10:

3. **Tasks are one-off.** The hub is for non-routine work, so there are no repeating tasks.
4. **Kinds are a simple list plus Other.** Appointment / booking, Medication refill, House chore, Document renewal, Other. A kind is only a label; nothing special hangs off it. No admin screen for managing kinds.
5. **Home task or named person.** By default a task belongs to the home and whoever is on shift can do it. A task can instead be tagged to one named person.
6. **Three visibility levels**, chosen by the creator:
   - *Everyone at the home* (default)
   - *Only the named person* (requires a named person)
   - *Supervisors only* (for things like document renewal)
   Supervisors of the home and admins always see every task.
7. **Overdue is loud.** A task not done by its due date raises a banner on the care app home page for the task's owner as soon as they log in. This replaces the September "feed item only" rule for tasks. The banner does not block clock-in or any other work.
8. **The banner cannot be dismissed.** It stays until the task is done or a supervisor/admin cancels it. Staff cannot cancel an overdue task.
9. **A supervisor or admin can complete a named person's task** on their behalf.
10. **Home tasks alert every staff member at the home**, not only those currently clocked in.

## Requirements

- **R1.** A task has a title, a kind, a location, a due date, a visibility level, and optionally a named person, a resident, a time and a description.
- **R2.** The kind picker shows the fixed list with Other last. The title is always free text.
- **R3.** Who sees a task:
  - *Everyone at the home*: staff assigned to that location, its supervisors, admins.
  - *Only the named person*: that person, the task's creator, supervisors of the home, admins.
  - *Supervisors only*: supervisors of the home, admins. Staff cannot choose this level when creating.
  Enforced server-side in the query/mutation layer, the same way carb logs are.
- **R4.** Who can mark a task done: for a home task, anyone who can see it; for a named-person task, that person, or a supervisor/admin on their behalf. Completion records who and when (name snapshotted, like carb logs) and an optional note.
- **R5.** Staff can edit or cancel a task they created **while it is not overdue**. Supervisors and admins can edit or cancel any task in their scope at any time. Cancelling records who and when; nothing is hard-deleted.
- **R6.** Overdue banner on the care home page, shown to the task's **owner**:
  - named-person task → that person;
  - home task → every staff member at that home;
  - supervisors-only task → supervisors of that home.
  Supervisors and admins also see overdue tasks for their homes. The banner lists each overdue task with how long it has been overdue ("Medication refill: call pharmacy, overdue 3 days") and a button to open it.
- **R7.** Tasks due today appear in the normal `DashboardNotifications` feed (not the banner).
- **R8.** A task tied to a resident stops alerting when the resident becomes inactive (see inactive-resident handling). The task is kept.
- **R9.** Done and cancelled tasks stay viewable in a History filter.

## Design

### Storage (migration 0026)

One table, `tasks`:

- `id uuid pk`
- `kind varchar(40) not null` — one of the keys in `TASK_KINDS` (`lib/tasks.ts`). Validated in code, deliberately **not** a database enum or CHECK, so adding a kind later is a one-line change with no migration.
- `title varchar(200) not null`
- `description text`
- `location varchar(255) not null` — same column convention the care logs use, so existing location-scope helpers apply unchanged
- `resident_id uuid → residents.id` (nullable, cascade)
- `assigned_staff_id varchar(255)` (nullable), `assigned_name_snapshot varchar(255)`
- `visibility varchar(20) not null default 'home'` — CHECK `home | assignee | supervisors`
- CHECK: `visibility <> 'assignee' OR assigned_staff_id IS NOT NULL`
- `due_date date not null` (operational date, string mode)
- `due_time varchar(5)` (nullable "HH:MM", display only, e.g. appointment at 14:30)
- `status varchar(20) not null default 'open'` — CHECK `open | done | cancelled`
- `created_by`, `created_by_name_snapshot`, `created_at`, `updated_at`, `updated_by`
- `completed_at`, `completed_by`, `completed_by_name_snapshot`, `completion_note`
- `cancelled_at`, `cancelled_by`, `cancelled_by_name_snapshot`
- Indexes: `(location, status, due_date)`, `(assigned_staff_id, status)`, `(resident_id)`.

Migrations are hand-applied in this repo. Verify and reconcile the drizzle journal before `db:migrate` (see memory: drizzle-migration-bookkeeping).

### Pure model — `lib/tasks.ts`

Unit-tested without a database, in the style of `lib/custom-log-schedule.ts`:

- `TASK_KINDS` — the list of kinds and their labels
- `classifyTask(task, today)` → `upcoming | due_today | overdue` plus `daysOverdue`
- `canSeeTask(viewer, task)`, `canCompleteTask(viewer, task)`, `canEditOrCancelTask(viewer, task, today)` → the R3–R5 rules in one place
- `isOverdueOwner(viewer, task)` → whether the banner is for this viewer (R6)
- `validateTaskInput(input, creatorRole)`

"Today" comes from `computeOperationalDate` in `lib/operational-time.ts`, so a task due on the 10th is still "today" for the night shift after midnight, and only becomes overdue when the operational day rolls over.

### Data layer

- `db/queries/tasks.ts` — `getTasksForScope(userId, {location?, status?, kind?, residentId?})`, `getOverdueTasksForUser(userId)`, `getTasksDueTodayForUser(userId)`.
- `db/mutations/tasks.ts` — `createTask`, `updateTask`, `cancelTask`, `completeTask`. Typed errors (`TaskValidationError`, `TaskConflictError`) plus the existing `AccessDeniedError`.

### API

- `GET/POST /api/care/tasks`
- `PATCH /api/care/tasks/[id]` (edit, cancel)
- `POST /api/care/tasks/[id]/complete` (`{note?}`)
- `GET /api/care/dashboard-notifications` gains `overdueTasks` and `tasksDueToday`.

No cron change. Overdue is worked out when the home page loads, so it is correct the moment someone logs in.

### UI

- **Overdue banner** at the top of the care app home page, above the Clock In area. High-contrast, lists each overdue task, not dismissible, does not block anything.
- **Tasks** entry in the care portal: list grouped Overdue / Today / Upcoming, filter by kind, resident and location (location filter only for people with more than one home).
- **New task** form: title, kind, due date, optional time, optional resident, "Who is this for?" (Anyone on shift / a named person from that home), "Who can see it?" (the three levels; staff do not get Supervisors only), description.
- Row actions: Done (optional note), Edit, Cancel.
- History filter showing done and cancelled.
- Resident page: a small "Tasks for this resident" list.
- `DashboardNotifications`: a "Tasks due today" block.

## Phases

1. Migration, schema, `lib/tasks.ts` + unit tests.
2. Queries, mutations, API routes with location and visibility scoping.
3. Tasks list, new-task form, complete / edit / cancel.
4. Overdue banner on the home page; due-today feed block; resident-page list.
5. Browser verification, PR against `deployment`.

## Out of scope

- Repeating tasks.
- Admin-defined custom log sheets (separate plan).
- An admin screen for managing kinds.
- Email or push notifications for tasks.
- Printing a task list.
