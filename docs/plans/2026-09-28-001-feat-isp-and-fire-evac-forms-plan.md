---
title: "feat: Fill ISP and Fire Evac assessments in-app"
type: feat
date: 2026-09-28
---

# feat: Fill ISP and Fire Evac assessments in-app

## Summary

Supervisors and admins can create a new ISP or Fire Evac assessment version by filling a form in the app instead of uploading a scanned file. Each form mirrors its paper original:

- **Fire Evac** — Wisconsin DHS F-62373 (Rev. 04/09), *Resident Evacuation Assessment*.
- **ISP** — Dane County *Adult Family Home – Individual Support Plan* (Afh-06-2014).

A form-built version is stored as structured answers on the existing `isp_files` / `fire_evac` rows, so activation, staff acknowledgments, 6-month / 12-month compliance reminders and inspector access keep working. File upload stays available for plans written outside the app. Every form-built version has a print view laid out like the paper form ("Print / Save as PDF") for wet signatures.

## Locked decisions (2026-09-28)

1. **Signatures:** typed name + date in-app for preparer/evaluators; guardian/provider sign the printed copy. No e-signature service.
2. **Who activates:** supervisors and admins can both save drafts and make a version live (same as ISP uploads today).
3. **Form definitions:** fixed in code, one typed schema per form, versioned by `formKey` + `formRevision`. Not admin-editable.
4. **Admission rule:** remind supervisors/admins when an active resident has no finalized evac assessment 3 days after admission.

## Requirements

- **R1.** A new version can start blank or as a copy of the resident's current form-built version. Header fields prefill from the resident and their house (resident name, facility name, facility address).
- **R2.** Drafts can be saved incomplete and edited. Only a finalized ISP can be activated; only a finalized evac assessment counts for compliance.
- **R3.** Answers are validated server-side with zod against the form's revision.
- **R4.** Uploaded-file versions and form-built versions appear side by side in the same version list. Staff acknowledgment of a form-built ISP works exactly like a file ISP.
- **R5.** Form-built documents open in a read view with **Print / Save as PDF**, matching the paper layout, including blank signature lines.
- **R6.** Fire evac due date is `completedAt + 12 months`, where `completedAt` is the form's *Date Form Completed* (falls back to `createdAt` for legacy uploads). Drafts never satisfy or reset the clock.
- **R7.** Admission reminder: an active resident with `placementDate` (fallback `createdAt`) more than 3 days ago and no finalized evac assessment gets a `fire_evac` alert. Inactive residents are skipped.
- **R8.** Inspectors can view the latest finalized form-built ISP / evac assessment at their location (print view), not only downloadable files.
- **R9.** No real resident data in fixtures, tests or the repo. The two sample PDFs stay out of git.

## Form structure

### Fire Evac — F-62373

- Header: facility name, facility address, date completed, resident name, room number, evaluator names.
- Sections I–VI, each item answered `yes | no | na`:
  - I. Risk of resistance — 3 items
  - II. Impaired mobility — 5 items (1, 2, 3, 4a, 4b)
  - III. Impaired consciousness — 3 items
  - IV. Need for extra staff — 3 items
  - V. Response to instructions — 3 items
  - VI. Waking response to alarm — 2 items
- Section VII (Response to fire drills) — 3 independent tasks, each `yes | no | na`.
- Evaluator's remarks (free text).
- The paper says "check one" per section, but the real example has Section VI with no "Yes" (N/A + No). Finalization rules therefore cannot demand exactly one Yes; see *Open questions*.

### ISP — Dane County AFH

- Header: individual, adult family home, IRIS consultant, plan start/end month.
- Section 1: daily routine, likes, dislikes.
- Section 2 (ADLs): bathing, personal appearance, dental care, nail care, shaving, dressing, medication administration, money management, other, shopping, meal preparation, laundry, cleaning.
- Section 3: household tasks / compensation.
- Section 4 (health): primary doctor, last physical, dentist, last dental exam, last eye exam + provider, other routine services, current health concerns; repeatable **condition care plans** (title, goal, protocol); special dietary needs; seizures (y/n) + accurate records kept (y/n); medications (free text: pharmacies + list).
- Section 5: 24-hour supervision required + detail, unsupervised circumstances, behavioral support.
- Section 6: Transportation *(title to confirm — missing from the sample scan)*.
- Section 7: back-up plan + repeatable respite providers (name, phone).
- Section 8: weapons.
- Section 9: personal goals (list).
- Participants: repeatable (name, role); signature + date left blank for wet signing.

Long text fields use plain text with light markup (`- ` bullets, blank-line paragraphs, `**bold**`), escaped and rendered by our own formatter. No rich-text editor dependency.

## Design

### Storage (migration 0018)

`isp_files`:
- add `form_key varchar(64)`, `form_revision varchar(32)`, `form_data jsonb`
- drop NOT NULL on `file_storage_id`, `file_name`, `file_size`, `content_type`
- CHECK: `file_storage_id IS NOT NULL OR form_data IS NOT NULL`
- add `finalized_at timestamp` — a form-built draft cannot be activated until it's set

`fire_evac`:
- add `form_key`, `form_revision`, `form_data jsonb`
- add `status varchar(20) NOT NULL DEFAULT 'final'` (`draft | final`); existing rows stay `final`
- add `completed_at timestamp`

Migrations are hand-applied in this repo — verify and reconcile the drizzle journal before `db:migrate` (see memory: drizzle-migration-bookkeeping).

### Form definitions — `lib/forms/`

- `fire-evac-assessment.ts` — section/item copy (the printed text), zod schema for drafts (all optional) and for finalization, `isFireEvacComplete()`.
- `isp-dane-afh.ts` — section/field definitions, draft + final zod schemas.
- `prefill.ts` — builds header defaults from resident + location, and copies a previous version's `form_data` (header dates cleared).
- Unit tests with invented data.

### API

- `POST /api/care/isp-forms` — create draft (blank or `copyFrom`), `PUT` update draft, `POST .../finalize`. Activation reuses the existing `PATCH /api/care/isp-files` activate path, which now refuses unfinalized form rows.
- `POST /api/care/fire-evac-forms`, `PUT`, `POST .../finalize` (sets `status='final'`, `completed_at`, assigns next `version`, resolves open `fire_evac` alerts for the resident).
- `GET .../prefill?residentId=` for both.
- All routes: supervisor/admin only, location-scoped the same way the existing ISP/fire-evac routes are.

### UI

- `ISPWorkspace` and `FireEvacManagement` gain **Fill form** and **New version from current** next to Upload.
- `IspFormEditor.tsx`, `FireEvacAssessmentEditor.tsx` — sectioned forms with sticky section nav, Save draft, Finalize. Evac items render as Yes/No/N/A segmented controls with the item text.
- Print: `printFireEvacAssessment.ts`, `printIsp.ts` using `shared/printDocument` (same pattern as `printLifeSafetyReports.ts`).
- `ResidentDocuments` / document viewer: form-built rows open the read/print view instead of a file download.

### Compliance

- `generate-compliance-alerts`: fire evac uses latest **final** row and `completed_at ?? created_at`; adds the admission rule (R7), skipping inactive residents.
- ISP reminder unchanged (keyed on the active `isp_files` row, which may now be form-built).
- `resident-documents` route and inspector queries: exclude fire-evac drafts; expose `formKey`/`hasForm` so viewers can render form-built docs; inspector route serves form data for the latest final/active rows at the location.

## Phases

1. Migration + schema + form definitions + unit tests.
2. Fire Evac: API, editor, print view, cron changes (smaller form — proves the pattern end to end).
3. ISP: API, editor, print view, activation guard.
4. Document viewer + inspector integration.
5. Browser verification, PR against `deployment`.

## Open questions

- **Evac finalization rule:** what makes an assessment complete enough to finalize (every item answered? at least one Yes per section I–V?). Section VI in the real sample has no Yes.
- **Section 6 title** on the ISP — assumed *Transportation*.
- **IRIS consultant prefill** — use `residents.caseManagerName`, or leave blank?
- **Admission rule for existing residents** — R7 as written alerts immediately for any existing active resident with no evac assessment at all. Intended (surfaces real gaps) but may be noisy on first run.
