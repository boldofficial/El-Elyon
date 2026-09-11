import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  ispSignatureDraftSchema,
  canManageISPSignatures,
  type ISPSignatureDraft,
} from "./isp-signatures";
import { createISPSignaturePDF } from "./isp-signature-pdf";
import { Documenso, verifyEnvelope, type SigningEnvelope } from "./documenso";
import { verifyDocumensoWebhook } from "./documenso-webhook";

const draft: ISPSignatureDraft = {
  title: "Individual Service Plan",
  versionLabel: "Review 1",
  effectiveDate: "2026-09-04",
  preparedBy: "Sample Supervisor",
  content: "Provide the agreed daily supports.",
  goals: ["Build independent living skills."],
  signers: [
    {
      name: "Sample Signer",
      email: "signer@example.test",
      role: "Representative",
    },
  ],
};
const envelope: SigningEnvelope = {
  id: "envelope_1",
  externalId: "packet-1",
  status: "PENDING",
  recipients: [
    {
      id: 1,
      name: "Sample Signer",
      email: "signer@example.test",
      role: "SIGNER",
      signingStatus: "NOT_SIGNED",
      signedAt: null,
    },
  ],
  envelopeItems: [{ id: "item-1" }],
};

test("only administrators and supervisors assigned to the resident location can manage signing", () => {
  assert.equal(canManageISPSignatures("admin", [], "Home A"), true);
  assert.equal(
    canManageISPSignatures("supervisor", ["Home A"], "Home A"),
    true,
  );
  for (const role of ["staff", "guardian", "kiosk", "inspector", ""])
    assert.equal(canManageISPSignatures(role, ["Home A"], "Home A"), false);
  assert.equal(
    canManageISPSignatures("supervisor", ["Home B"], "Home A"),
    false,
  );
  assert.equal(canManageISPSignatures("supervisor", [], "Home A"), false);
});

test("validates real dates, goals and unique recipient emails, and rejects client-owned status", () => {
  assert.equal(ispSignatureDraftSchema.safeParse(draft).success, true);
  for (const invalid of [
    { effectiveDate: "2026-02-30" },
    { goals: [] },
    { signers: [] },
    { content: "" },
    { state: "completed" },
    {
      signers: [
        ...draft.signers,
        { ...draft.signers[0], email: "SIGNER@example.test" },
      ],
    },
  ])
    assert.equal(
      ispSignatureDraftSchema.safeParse({ ...draft, ...invalid }).success,
      false,
    );
  const parsed = ispSignatureDraftSchema.parse({
    ...draft,
    signers: [{ ...draft.signers[0], email: "  SIGNER@example.test  " }],
  });
  assert.equal(parsed.signers[0].email, "signer@example.test");
});

test("long plans paginate and each of 20 signers has separate signature and date fields within page bounds", async () => {
  const longDraft = {
    ...draft,
    content: "A detailed support statement. ".repeat(1500),
    signers: Array.from({ length: 20 }, (_, i) => ({
      name: `Signer ${i}`,
      email: `signer${i}@example.test`,
      role: "Participant",
    })),
  };
  const { bytes, fields } = await createISPSignaturePDF(
    longDraft,
    "Sample Resident",
    "packet-test",
  );
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 6);
  assert.equal(fields.length, 20);
  const positions = new Set<string>();
  for (const pair of fields) {
    assert.deepEqual(
      pair.map((f) => f.type),
      ["SIGNATURE", "DATE"],
    );
    for (const field of pair) {
      assert.ok(field.page <= pdf.getPageCount());
      assert.ok(field.positionX >= 0 && field.positionX + field.width <= 100);
      assert.ok(field.positionY >= 0 && field.positionY + field.height <= 100);
      positions.add(`${field.page}:${field.positionX}:${field.positionY}`);
    }
  }
  assert.equal(positions.size, 40);
});

test("unsupported text is rejected instead of silently corrupting the ISP", async () => {
  await assert.rejects(
    createISPSignaturePDF(
      { ...draft, content: "Support 😀" },
      "Resident",
      "id",
    ),
    /font cannot display/,
  );
});

test("provider identity, recipient set, and all signatures are required before completion", () => {
  assert.doesNotThrow(() => verifyEnvelope(envelope, "packet-1", draft));
  for (const bad of [
    { ...envelope, externalId: "different" },
    { ...envelope, recipients: [] },
    { ...envelope, envelopeItems: [] },
    { ...envelope, status: "COMPLETED" as const },
    {
      ...envelope,
      recipients: [
        ...envelope.recipients,
        { ...envelope.recipients[0], role: "CC" },
      ],
    },
  ])
    assert.throws(() => verifyEnvelope(bad, "packet-1", draft));
  assert.doesNotThrow(() =>
    verifyEnvelope(
      {
        ...envelope,
        status: "COMPLETED",
        recipients: [{ ...envelope.recipients[0], signingStatus: "SIGNED" }],
      },
      "packet-1",
      draft,
    ),
  );
});

test("webhooks fail closed for absent, weak, and incorrect secrets", () => {
  const secret = "a".repeat(64);
  assert.equal(verifyDocumensoWebhook(secret, secret), true);
  for (const [received, expected] of [
    [null, secret],
    [secret, undefined],
    ["short", "short"],
    ["b".repeat(64), secret],
    [secret + "x", secret],
  ] as const)
    assert.equal(verifyDocumensoWebhook(received, expected), false);
});

test("adapter uses the released multipart API and email distribution without returning signing tokens", async () => {
  process.env.DOCUMENSO_URL = "https://signing.example.test";
  process.env.DOCUMENSO_API_TOKEN = "test-token";
  const calls: { url: string; init?: RequestInit }[] = [];
  const transport: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({
      id: "envelope_1",
      success: true,
      recipients: [{ token: "secret-token" }],
    });
  };
  const provider = new Documenso(undefined, transport);
  const pdf = await createISPSignaturePDF(draft, "Sample Resident", "packet-1");
  assert.equal(
    await provider.create("packet-1", draft, pdf.bytes, pdf.fields),
    "envelope_1",
  );
  assert.equal(
    calls[0].url,
    "https://signing.example.test/api/v2/envelope/create",
  );
  const form = calls[0].init?.body as FormData;
  const payload = JSON.parse(form.get("payload") as string);
  assert.equal(payload.externalId, "packet-1");
  assert.equal(payload.meta.distributionMethod, "EMAIL");
  assert.equal(payload.meta.signingOrder, "PARALLEL");
  assert.equal(payload.recipients[0].fields.length, 2);
  assert.equal(form.getAll("files").length, 1);
  assert.equal(await provider.send("envelope_1"), undefined);
  assert.equal(
    calls[1].url,
    "https://signing.example.test/api/v2/envelope/distribute",
  );
  assert.equal(calls[1].init?.redirect, "error");
  assert.throws(
    () => new Documenso("https://different.example.test"),
    /different signing server/,
  );
});

test("ambiguous provider failure makes one attempt and does not leak response content", async () => {
  process.env.DOCUMENSO_URL = "https://signing.example.test";
  process.env.DOCUMENSO_API_TOKEN = "test-token";
  let attempts = 0;
  const provider = new Documenso(undefined, async () => {
    attempts++;
    return new Response("private medical information", { status: 500 });
  });
  await assert.rejects(
    provider.send("envelope_1"),
    (error) =>
      error instanceof Error &&
      !error.message.includes("private medical") &&
      error.message.includes("500"),
  );
  assert.equal(attempts, 1);
});

test("uncertain creation is recovered by exact external ID and refuses duplicate matches", async () => {
  process.env.DOCUMENSO_URL = "https://signing.example.test";
  process.env.DOCUMENSO_API_TOKEN = "test-token";
  const provider = new Documenso(undefined, async (url) =>
    Response.json(
      String(url).includes("?")
        ? {
            data: [{ id: "envelope_1", externalId: "packet-1" }],
            totalPages: 1,
          }
        : envelope,
    ),
  );
  assert.equal((await provider.recover("packet-1")).id, "envelope_1");
  const duplicates = new Documenso(undefined, async () =>
    Response.json({
      data: [envelope, { ...envelope, id: "envelope_2" }],
      totalPages: 1,
    }),
  );
  await assert.rejects(
    duplicates.recover("packet-1"),
    /could not be reconciled/,
  );
});
