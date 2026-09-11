# ISP signing deployment

## What is included

- Migration `drizzle/0015_add_isp_signature_packets.sql`, registered in the Drizzle journal.
- ISP authoring and signature controls in the administrator and supervisor workflows.
- Server-side adapter for Documenso **v2.17.0** envelope API; optional server connection settings in `.env.example`.
- Deployment example in `deploy/documenso/`, adapted from [upstream production Compose](https://github.com/documenso/documenso/blob/v2.17.0/docker/production/compose.yml) and its [deployment guide](https://docs.documenso.com/docs/self-hosting/deployment/docker-compose).

## Provision signing service

1. Choose the signing host and HTTPS domain. The signing service runs separately from the Next.js deployment. Allow the application to reach it and recipients to open its public HTTPS signing links.
2. Copy `deploy/documenso/` to that host. Copy `.env.example` to `.env`; supply database/encryption/session secrets, the real domain and approved SMTP account. The database password in this example must be URL-safe (random hexadecimal is suitable).
3. Supply `cert.p12` and its passphrase. The certificate is mandatory: signing fails without it. Follow [certificate setup](https://docs.documenso.com/docs/self-hosting/configuration/signing-certificate/local). Make it readable by container UID 1001 and keep it outside source control. A local certificate does not automatically confer Adobe trust-list recognition.
4. Run `docker compose --env-file .env up -d` from the deployment directory. Place an HTTPS reverse proxy in front of `127.0.0.1:3002`, pointing the configured domain at it. The database is not published to the host network.
5. Create a dedicated integration account/team, verify email delivery, and create its API token. Limit interactive access to that team because documents can also be edited by authorized users in Documenso. Disable public signup after accounts are provisioned (`NEXT_PUBLIC_DISABLE_SIGNUP=true`) and recreate the service.
6. Back up the database volume (including its stored PDFs), encryption keys and signing certificate. Keep the private app storage bucket and server logs under the organization's existing access/retention controls. Use your approved hosting and email arrangements for resident records.

The example is pinned to the API release researched, but has not been launched in this workspace. Before changing its version, run the integration acceptance flow against the intended release.

## Connect El Elyon

Configure these **server-side** environment variables on the application:

```
DOCUMENSO_URL=https://your-signing-domain.example
DOCUMENSO_API_TOKEN=<integration team's token>
DOCUMENSO_WEBHOOK_SECRET=<at least 32 random characters>
```

Do not include `/api/v2` in `DOCUMENSO_URL`. The adapter adds it. Do not prefix these settings with `NEXT_PUBLIC_`. Existing private object-storage configuration is reused.

In Documenso, register an HTTPS webhook at:

```
https://your-application-domain.example/api/webhooks/documenso
```

Set its secret to exactly `DOCUMENSO_WEBHOOK_SECRET`. Subscribe to `DOCUMENT_SENT`, `DOCUMENT_SIGNED`, `DOCUMENT_RECIPIENT_COMPLETED`, `DOCUMENT_COMPLETED`, `DOCUMENT_REJECTED`, and `DOCUMENT_CANCELLED`. This API sends the configured secret as `X-Documenso-Secret`; it is not an HMAC signature. A blank secret is rejected. Busy or failed processing returns an error so delivery can be retried. **Refresh status** is the recovery path for missed notifications.

## Database and application rollout

1. Back up the application database and verify its migration journal is already current through 0014. Follow this repository's baseline process for older databases; do not apply the initial schema again.
2. Apply `npm run db:migrate` against the intended deployment database. Migration 0015 only adds a new table and indexes; existing ISP rows are not rewritten. Use the normal migration runner, not `db:push`.
3. Deploy the application and configure the three connection settings. Drafting and PDF preview work without a signing connection after the migration; the UI displays the missing setup and disables sending.
4. Verify with fictional data and designated test inboxes before sending an actual ISP. No test invitations were sent during development.

## Acceptance flow

- Administrator with no assigned locations can prepare an ISP. Supervisor can manage only assigned residents. Staff, kiosk, guardian and inspector roles cannot use management endpoints.
- Save a multi-page plan with at least two signers. Reopen it; verify all text, goals, relationships, email addresses and non-overlapping signature/date fields in the PDF.
- Send once; both test inboxes receive links. A second click or request refresh must reuse the same envelope. Signing URLs and API tokens must not appear in application responses.
- Sign once, refresh, and confirm the second person remains pending. Send a reminder and confirm only unsigned people receive it. The app limits manual reminder requests to one per hour per packet.
- Complete all signatures. Verify the webhook/refresh archives the signed PDF and audit PDF, creates one draft ISP file, and does not change the active ISP.
- Activate the new file through normal ISP management. Verify care staff in the assigned location can view it and acknowledge it.
- Cancel a separate pending test request. Its signing link must no longer accept signatures. Prepare a new revision to correct recipients or content.
- Replay a completion webhook: one file remains. Send a wrong-secret callback: 401 and no state change. Stop the provider during a send; retry through refresh without creating duplicate envelopes.

## Operational recovery

`preparing` means provider creation may have succeeded without a usable response. `sending` means distribution needs checking. Use **Refresh status** first. Recovery searches up to 1,000 envelopes and requires exactly one matching external ID (the packet UUID). It never blindly creates another envelope.

If recovery finds zero/multiple matches, an administrator must inspect the integration team's Documenso records by packet UUID and reconcile the provider outcome before making a replacement. Do not reset the database state to draft blindly. Keep the same signing-server origin for existing packets; the adapter refuses to send/read them through a different origin. A crashed action lock expires after five minutes.

If completion is recorded remotely but storage download/upload fails, refresh again. Deterministic object paths and ISP file IDs make archival repeatable. If credentials expire, restore the same team's token. The original/signed/audit files remain in application storage once archived.

For rollback, roll back application code or disable the connection; retain the new table and stored documents. Pending requests continue to exist at the signing provider and must be managed there until the application is restored. Do not drop the new table while records exist.

## Verification performed locally

Passed: 16 automated tests (`npm run test:isp-signatures`), TypeScript checking, targeted lint checks for the new implementation, and `npm run build`. The first sandboxed build could not fetch the app's existing Google Fonts; the build succeeded with network access.

Tests cover role/location policy, input validation, multi-page PDFs and field bounds, webhook secrets, provider identity, full-signature requirements, API payload shape, ambiguous creation/distribution recovery, reminder throttling, stale reviews, concurrent-action rejection and repeatable completion. Workflow tests use in-memory repository responses and mocked provider/storage calls; they do not exercise PostgreSQL locks or replace acceptance testing against a running Documenso instance and database. Node's experimental module-mocking flag is required by the workflow test command (verified with Node 24).
