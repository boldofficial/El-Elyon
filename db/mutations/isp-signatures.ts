import { randomUUID, createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../index";
import {
  ispSignaturePackets as packets,
  ispFiles,
  residents,
  auditLogs,
} from "../schema";
import {
  requireSupervisorAccess,
  requireCareAccess,
  AccessDeniedError,
} from "../../lib/db-helpers";
import {
  canManageISPSignatures,
  ISPSignatureError,
  type ISPSignatureDraft,
} from "../../lib/isp-signatures";
import { createISPSignaturePDF } from "../../lib/isp-signature-pdf";
import { Documenso, verifyEnvelope } from "../../lib/documenso";
import { uploadFile } from "../../lib/aws-s3";

export type SignaturePacket = typeof packets.$inferSelect;

export async function requireSignatureResident(
  userId: string,
  residentId: string,
) {
  const role = await requireSupervisorAccess(userId);
  const resident = await db.query.residents.findFirst({
    where: eq(residents.id, residentId),
  });
  if (!resident) throw new ISPSignatureError("Resident not found.", 404);
  if (
    !canManageISPSignatures(
      role.role || "",
      role.locations || [],
      resident.location,
    )
  )
    throw new AccessDeniedError("Access denied to this resident.");
  return resident;
}

export async function requireSignaturePacket(userId: string, id: string) {
  const packet = await db.query.ispSignaturePackets.findFirst({
    where: eq(packets.id, id),
  });
  if (!packet) throw new ISPSignatureError("ISP not found.", 404);
  await requireSignatureResident(userId, packet.residentId);
  return packet;
}

function audit(userId: string, id: string, event: string) {
  return db
    .insert(auditLogs)
    .values({
      clerkUserId: userId,
      event: `isp_signature.${event}`,
      details: `ISP signature packet ${id}`,
      timestamp: new Date(),
      deviceId: "system",
      location: "",
    });
}

export function publicSignaturePacket(packet: SignaturePacket) {
  const {
    id,
    residentId,
    draft,
    state,
    revision,
    signerStatuses,
    createdAt,
    updatedAt,
    lastSyncedAt,
    signedKey,
    auditKey,
  } = packet;
  return {
    id,
    residentId,
    draft,
    state,
    revision,
    signerStatuses,
    createdAt,
    updatedAt,
    lastSyncedAt,
    hasSignedPDF: !!signedKey,
    hasAuditPDF: !!auditKey,
  };
}

export async function createSignatureDraft(
  userId: string,
  id: string,
  residentId: string,
  draft: ISPSignatureDraft,
) {
  const resident = await requireSignatureResident(userId, residentId);
  await createISPSignaturePDF(draft, resident.name, id);
  const [created] = await db
    .insert(packets)
    .values({
      id,
      residentId,
      residentName: resident.name,
      draft,
      createdBy: userId,
    })
    .onConflictDoNothing()
    .returning();
  if (created) {
    await audit(userId, id, "created");
    return created;
  }
  const existing = await requireSignaturePacket(userId, id);
  if (existing.residentId !== residentId || existing.createdBy !== userId)
    throw new ISPSignatureError("This draft reference is already in use.", 409);
  if (!isDeepStrictEqual(existing.draft, draft))
    throw new ISPSignatureError(
      "A saved draft already uses this reference. Reload and edit the saved draft.",
      409,
    );
  return existing;
}

export async function saveSignatureDraft(
  userId: string,
  id: string,
  revision: number,
  draft: ISPSignatureDraft,
) {
  const packet = await requireSignaturePacket(userId, id);
  await createISPSignaturePDF(draft, packet.residentName, id);
  const [saved] = await db
    .update(packets)
    .set({
      draft,
      revision: sql`${packets.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(packets.id, id),
        eq(packets.state, "draft"),
        eq(packets.revision, revision),
        or(isNull(packets.lockedUntil), lt(packets.lockedUntil, new Date())),
      ),
    )
    .returning();
  if (!saved)
    throw new ISPSignatureError(
      "This ISP changed or is already being sent. Reload it before editing.",
      409,
    );
  await audit(userId, id, "updated");
  return saved;
}

/** Serialize provider effects. A persisted preparing state prevents duplicate creates after a crash. */
export async function signatureAction(
  userId: string,
  id: string,
  action: "send" | "sync" | "remind" | "cancel",
  revision?: number,
) {
  await requireSignaturePacket(userId, id);
  return performSignatureAction(userId, id, action, revision);
}

// Called only after webhook authentication. Re-fetch actual state; never trust event status.
export async function syncSignatureEnvelope(providerId: string) {
  const provider = new Documenso();
  const packet = await db.query.ispSignaturePackets.findFirst({
    where: and(
      eq(packets.providerId, providerId),
      eq(packets.providerOrigin, provider.origin),
    ),
  });
  if (!packet) return;
  return performSignatureAction("system:documenso", packet.id, "sync");
}

export async function requireSignatureStorageAccess(
  userId: string,
  key: string,
) {
  const match =
    /^isp-signatures\/([0-9a-f-]{36})\/(original|signed|audit)\.pdf$/.exec(key);
  if (!match) throw new AccessDeniedError("Access denied.");
  const packet = await db.query.ispSignaturePackets.findFirst({
    where: eq(packets.id, match[1]),
  });
  if (
    !packet ||
    ![packet.originalKey, packet.signedKey, packet.auditKey].includes(key)
  )
    throw new AccessDeniedError("Access denied.");
  if (key !== packet.signedKey) {
    await requireSignatureResident(userId, packet.residentId);
    return;
  }
  const role = await requireCareAccess(userId);
  const resident = await db.query.residents.findFirst({
    where: eq(residents.id, packet.residentId),
  });
  if (
    !resident ||
    (role.role !== "admin" &&
      !(role.locations || []).includes(resident.location))
  )
    throw new AccessDeniedError("Access denied.");
  if (role.role === "staff") {
    const active = await db.query.ispFiles.findFirst({
      where: and(eq(ispFiles.id, packet.id), eq(ispFiles.status, "active")),
    });
    if (!active)
      throw new AccessDeniedError("This ISP has not been activated.");
  }
}

async function performSignatureAction(
  userId: string,
  id: string,
  action: "send" | "sync" | "remind" | "cancel",
  revision?: number,
) {
  const token = randomUUID();
  const [packet] = await db
    .update(packets)
    .set({ lockToken: token, lockedUntil: new Date(Date.now() + 5 * 60000) })
    .where(
      and(
        eq(packets.id, id),
        or(isNull(packets.lockedUntil), lt(packets.lockedUntil, new Date())),
      ),
    )
    .returning();
  if (!packet)
    throw new ISPSignatureError(
      "Another action is in progress. Please refresh shortly.",
      409,
    );
  const owned = and(eq(packets.id, id), eq(packets.lockToken, token));
  async function update(values: Partial<typeof packets.$inferInsert>) {
    const [next] = await db
      .update(packets)
      .set({ ...values, updatedAt: new Date() })
      .where(owned)
      .returning();
    if (!next)
      throw new ISPSignatureError("This action expired. Refresh status.", 409);
    Object.assign(packet, next);
  }
  try {
    if (action === "send" && revision !== packet.revision)
      throw new ISPSignatureError(
        "The ISP changed since review. Preview the current revision before sending.",
        409,
      );
    const provider = new Documenso(packet.providerOrigin);
    if (packet.state === "draft") {
      if (action !== "send") return packet;
      const pdf = await createISPSignaturePDF(
        packet.draft,
        packet.residentName,
        id,
      );
      const originalKey = `isp-signatures/${id}/original.pdf`;
      await uploadFile(originalKey, pdf.bytes, "application/pdf");
      await audit(userId, id, "send_requested");
      await update({
        state: "preparing",
        providerOrigin: provider.origin,
        originalKey,
        originalSha256: createHash("sha256").update(pdf.bytes).digest("hex"),
      });
      // Never reset to draft on errors: create may have succeeded remotely.
      const providerId = await provider.create(
        id,
        packet.draft,
        pdf.bytes,
        pdf.fields,
      );
      await update({ providerId, state: "ready" });
    }
    let envelope = packet.providerId
      ? await provider.get(packet.providerId)
      : await provider.recover(id);
    verifyEnvelope(envelope, id, packet.draft);
    if (!packet.providerId) await update({ providerId: envelope.id });
    if (action === "send" && envelope.status === "DRAFT") {
      await update({ state: "sending" });
      await provider.send(envelope.id);
      await audit(userId, id, "sent");
      envelope = await provider.get(envelope.id);
    } else if (action === "remind") {
      if (envelope.status !== "PENDING")
        throw new ISPSignatureError(
          "Reminders are available only while signatures are pending.",
          409,
        );
      if (
        packet.lastReminderAt &&
        Date.now() - packet.lastReminderAt.getTime() < 3600000
      )
        throw new ISPSignatureError(
          "A reminder was requested in the last hour. Please wait before sending another.",
          429,
        );
      const unsigned = envelope.recipients
        .filter(
          (s) => s.signingStatus !== "SIGNED" && s.signingStatus !== "REJECTED",
        )
        .map((s) => s.id);
      if (unsigned.length) {
        // Record before calling so ambiguous responses cannot cause repeated reminder emails.
        await update({ lastReminderAt: new Date() });
        await provider.remind(envelope.id, unsigned);
        await audit(userId, id, "reminder_requested");
      }
    } else if (action === "cancel") {
      if (envelope.status !== "PENDING" && envelope.status !== "CANCELLED")
        throw new ISPSignatureError(
          "Only a pending request can be cancelled.",
          409,
        );
      if (envelope.status === "PENDING") await provider.cancel(envelope.id);
      await audit(userId, id, "cancelled");
      envelope = await provider.get(envelope.id);
    }
    verifyEnvelope(envelope, id, packet.draft);
    const state =
      envelope.status === "DRAFT"
        ? "ready"
        : (envelope.status.toLowerCase() as SignaturePacket["state"]);
    if (packet.state === "completed" && state !== "completed")
      throw new ISPSignatureError(
        "The signing server returned an inconsistent status. Contact an administrator.",
        502,
      );
    if (
      envelope.status === "COMPLETED" &&
      (!packet.signedKey || !packet.auditKey)
    ) {
      const signed = await provider.download(envelope.envelopeItems[0].id);
      const auditPDF = await provider.download(envelope.id, true);
      const signedKey = `isp-signatures/${id}/signed.pdf`;
      const auditKey = `isp-signatures/${id}/audit.pdf`;
      await uploadFile(signedKey, signed, "application/pdf");
      await uploadFile(auditKey, auditPDF, "application/pdf");
      // The deterministic file ID makes archival repeatable after a process crash.
      await db.batch([
        db
          .insert(ispFiles)
          .values({
            id,
            residentId: packet.residentId,
            versionLabel: packet.draft.versionLabel,
            effectiveDate: new Date(`${packet.draft.effectiveDate}T12:00:00Z`),
            status: "draft",
            fileStorageId: signedKey,
            fileName: "signed-individual-service-plan.pdf",
            fileSize: signed.length,
            contentType: "application/pdf",
            preparedBy: packet.draft.preparedBy,
            notes: `Electronically signed ISP. Signature record: ${id}`,
            uploadedBy: packet.createdBy,
            uploadedAt: new Date(),
          })
          .onConflictDoNothing(),
        db.update(packets).set({ signedKey, auditKey }).where(owned),
        audit(userId, id, "archived"),
      ]);
      packet.signedKey = signedKey;
      packet.auditKey = auditKey;
    }
    await update({
      state,
      lastSyncedAt: new Date(),
      signerStatuses: envelope.recipients.map((s) => ({
        email: s.email,
        name: s.name,
        status: s.signingStatus,
        signedAt: s.signedAt ?? null,
      })),
    });
    return packet;
  } finally {
    await db
      .update(packets)
      .set({ lockToken: null, lockedUntil: null })
      .where(owned);
  }
}
