# ISP electronic signatures: selection and implementation

Researched September 4, 2026. This is a comparison of the main maintained open-source candidates and two lighter alternatives, not an exhaustive inventory of every repository.

## Recommendation

Use **self-hosted Documenso**, connected through its server-side REST API. Supervisors and administrators prepare the ISP inside El Elyon; recipients receive Documenso email links, review the complete PDF, and sign without an El Elyon account. El Elyon retains the original snapshot, signed PDF, signature audit PDF, and per-recipient status.

This choice is based on its documented core self-hosting support, current envelope API, and compatibility with a standalone integration. Upstream's `getServerLimits` implementation explicitly uses self-hosted limits when billing is disabled. Core is AGPL-3.0; enterprise modules have separate terms. Review the upstream licenses for the selected deployment. Hosting, email delivery, backups and maintenance still have costs. [Self-hosting guide](https://docs.documenso.com/docs/self-hosting), [license](https://github.com/documenso/documenso/blob/v2.17.0/LICENSE), [self-hosted limits](https://github.com/documenso/documenso/blob/v2.17.0/packages/ee/server-only/limits/server.ts).

## Alternatives considered

| Project | Fit for emailed ISP signatures | Tradeoff / decision |
|---|---|---|
| **Documenso** | Standalone service, PDF recipients and signature/date fields, email distribution, status, cancellation, reminders and PDF/audit downloads | Selected. Integration targets the envelope API in released **v2.17.0**. Enterprise features such as SSO and white-label embedding are outside this implementation. [API](https://docs.documenso.com/docs/developers/api/documents), [release](https://github.com/documenso/documenso/releases/tag/v2.17.0) |
| **DocuSeal** | Strong PDF form builder and signing experience, self-hostable AGPL core | Official pricing places API and embedding under Pro, including on-premises usage charges. A good option if commercial integration charges are acceptable. [On-premises](https://www.docuseal.com/on-premises), [pricing](https://www.docuseal.com/pricing), [source and license](https://github.com/docusealco/docuseal) |
| **OpenSign** | AGPL-3.0, multiple signers, reusable templates, email invitations, audit certificates and REST API | Viable alternative. Its published v1.2 API docs primarily describe hosted endpoints; self-hosted API availability and exact release compatibility need a deployment test before substituting it. No assumption that hosted API pricing describes all self-hosted features. [Source](https://github.com/OpenSignLabs/OpenSign), [API](https://docs.opensignlabs.com/docs/API-docs/v1.2/opensign-api-v-1-2/), [plans](https://www.opensignlabs.com/plans-pricing) |
| **LibreSign** | AGPL-3.0 Nextcloud app, external signers, notifications and an OCS API | Best fit where Nextcloud is already operated. El Elyon does not use Nextcloud, so it adds a larger operational dependency. [Source](https://github.com/LibreSign/libresign), [API guide](https://docs.libresign.coop/developer_manual/api/guide-api.html) |
| **signaturepdf** | Lightweight self-hosted PDF signing, including shared signing | Worth considering for simpler manual workflows; its documented focus is PDF manipulation and signing rather than this application's full managed recipient lifecycle. [Source](https://github.com/24eme/signaturepdf) |
| **JSignPdf** | Desktop/CLI digital PDF signing | Useful for certificate signing automation, but does not supply the email invitation, recipient portal and tracking workflow needed here. [Source](https://github.com/intoolswetrust/jsignpdf) |

## Implemented workflow

1. Admin: Compliance → resident's **Manage ISP**. Supervisor: Compliance → select resident → **Prepare ISP & collect signatures**.
2. Prepare title, version, effective date, preparer, plan narrative, goals and 1–20 named signers with their relationships and distinct email addresses.
3. Save and edit drafts. Preview the complete paginated PDF and recipient list before sending.
4. The backend freezes the snapshot, creates one Documenso envelope, and sends invitations to all signers in parallel. The email subject and message do not contain the resident's name or plan narrative.
5. Recipients use Documenso's signing page. The application does not expose recipient signing tokens to supervisors or administrators.
6. Verified webhook notifications trigger a fresh authenticated status lookup. The UI also has **Refresh status**, **Remind unsigned people**, and **Cancel request**.
7. After every required signer has signed, download and retain the signed PDF and audit PDF in private object storage. Create an ISP file in draft status. A supervisor/admin reviews and activates it using the existing activation workflow.
8. A completed, declined or cancelled request can be copied into a new draft for revision. Sent snapshots stay unchanged. Staff read acknowledgments remain distinct from these external signatures.

## Design decisions

- A separate signature packet table avoids changing the meaning of existing ISP records and staff acknowledgments.
- Role and resident-location checks apply to every management route and every PDF download. Staff can access an activated signed ISP through the existing care-file path, but not its preparatory or audit records.
- Database revision checks prevent stale draft writes; an expiring per-packet lock serializes send/refresh/reminder/cancel operations. The `preparing` marker is written before remote creation, so an uncertain response cannot cause a blind duplicate create.
- A missing creation response is reconciled by the envelope's exact external ID. Ambiguous or missing matches stop for operator review. The server origin is recorded to prevent an environment change from attaching the wrong provider's document.
- Webhooks use the released API's `X-Documenso-Secret` header, compared in constant time. They are notifications only: signer status from the body is never accepted as evidence of completion. [Upstream verification contract](https://github.com/documenso/documenso/blob/v2.17.0/apps/docs/content/docs/developers/webhooks/verification.mdx).
- The original hash identifies the saved source PDF. Documenso supplies the actual signature sealing and audit record; the application does not invent a signature cryptography scheme.
- Signed files are inserted using the packet UUID, making archival retryable. Signing completion does not automatically activate the plan or reset staff acknowledgments.

## Boundaries and remaining setup

The application implementation and database migration are included. No production migration, signing service deployment, live invitation, or real signature was performed during development. The workspace has no Documenso connection configured, and a local Docker engine was not running.

Before live use, follow `docs/deployment/2026-09-04-isp-signatures.md`. Use the organization's approved ISP content and required participant list; this editor is not a jurisdiction-specific ISP form template. Confirm electronic signing is accepted by the relevant program/agency and that the hosting/email arrangements are approved for the resident information involved. Open-source software alone does not establish regulatory compliance.

Current limits: one generated PDF per packet; text and goals rather than a drag-and-drop form designer; distinct signer emails; signatures in parallel; the built-in PDF font supports Western text and rejects unsupported characters with an error; corrected recipient addresses require cancellation and a new draft. Uploaded legacy PDFs remain in the existing upload workflow and are not automatically converted into signature requests.
