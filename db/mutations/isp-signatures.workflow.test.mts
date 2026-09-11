import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { createRequire } from "node:module";
import type { SigningEnvelope } from "../../lib/documenso";
import type { ISPSignatureDraft } from "../../lib/isp-signatures";
const require = createRequire(import.meta.url);
const { Documenso } =
  require("../../lib/documenso.ts") as typeof import("../../lib/documenso");
const { ISPSignatureError } =
  require("../../lib/isp-signatures.ts") as typeof import("../../lib/isp-signatures");

// In-memory repository responses exercise the actual orchestration, with no database,
// object store, Clerk session, or email connection. SQL constraints need staging verification.
const draft: ISPSignatureDraft = {
  title: "ISP",
  versionLabel: "1",
  effectiveDate: "2026-09-04",
  preparedBy: "Supervisor",
  content: "Sample support plan.",
  goals: ["Sample goal"],
  signers: [
    { name: "Signer", email: "signer@example.test", role: "Representative" },
  ],
};
const id = "11111111-1111-4111-8111-111111111111";
let packet: Record<string, unknown>;
let role = "supervisor";
let providerCreates = 0;
let sends = 0;
let archiveInserts = 0;
let concurrent = false;
let remote: SigningEnvelope;

function reset() {
  packet = {
    id,
    residentId: id,
    residentName: "Sample Resident",
    draft,
    state: "draft",
    revision: 1,
    providerId: null,
    providerOrigin: null,
    originalKey: null,
    originalSha256: null,
    signedKey: null,
    auditKey: null,
    signerStatuses: [],
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSyncedAt: null,
    lastReminderAt: null,
    lockToken: null,
    lockedUntil: null,
  };
  role = "supervisor";
  providerCreates = 0;
  sends = 0;
  archiveInserts = 0;
  concurrent = false;
  remote = {
    id: "envelope_1",
    externalId: id,
    status: "DRAFT",
    recipients: [
      {
        id: 1,
        name: "Signer",
        email: "signer@example.test",
        role: "SIGNER",
        signingStatus: "NOT_SIGNED",
        signedAt: null,
      },
    ],
    envelopeItems: [{ id: "item-1" }],
  };
}

const repo = {
  query: {
    ispSignaturePackets: { findFirst: async () => ({ ...packet }) },
    residents: {
      findFirst: async () => ({
        id,
        name: "Sample Resident",
        location: "Home A",
      }),
    },
    ispFiles: { findFirst: async () => ({ id, status: "active" }) },
  },
  update() {
    return {
      set(values: Record<string, unknown>) {
        return {
          where() {
            let applied = false;
            const apply = () => {
              if (!applied) {
                Object.assign(packet, values);
                applied = true;
              }
              return [{ ...packet }];
            };
            return {
              returning: async () =>
                concurrent && values.lockToken ? [] : apply(),
              then: (resolve: (value: unknown) => unknown) => resolve(apply()),
            };
          },
        };
      },
    };
  },
  insert(table: unknown) {
    return {
      values() {
        const result = {
          onConflictDoNothing() {
            archiveInserts++;
            return Promise.resolve();
          },
          then: (resolve: (value: unknown) => unknown) => resolve(table),
        };
        return result;
      },
    };
  },
  batch: async (operations: PromiseLike<unknown>[]) => Promise.all(operations),
};

class Denied extends Error {}
mock.module("../index.ts", { namedExports: { db: repo } });
mock.module("../../lib/db-helpers.ts", {
  namedExports: {
    AccessDeniedError: Denied,
    requireSupervisorAccess: async () => {
      if (role === "staff") throw new Denied();
      return { role, locations: role === "supervisor" ? ["Home A"] : [] };
    },
    requireCareAccess: async () => ({ role, locations: ["Home A"] }),
  },
});
mock.module("../../lib/aws-s3.ts", {
  namedExports: { uploadFile: async () => ({ key: "test" }) },
});
const { signatureAction } =
  require("./isp-signatures.ts") as typeof import("./isp-signatures");

process.env.DOCUMENSO_URL = "https://signing.example.test";
process.env.DOCUMENSO_API_TOKEN = "test-token";

test("send freezes once; repeated sends reuse the envelope and do not email again", async () => {
  reset();
  const mocks = [
    mock.method(Documenso.prototype, "create", async () => {
      providerCreates++;
      assert.equal(packet.state, "preparing");
      return remote.id;
    }),
    mock.method(Documenso.prototype, "get", async () => remote),
    mock.method(Documenso.prototype, "send", async () => {
      sends++;
      assert.equal(packet.state, "sending");
      remote = { ...remote, status: "PENDING" };
    }),
  ];
  try {
    await signatureAction("user-1", id, "send", 1);
    assert.equal(packet.state, "pending");
    assert.equal(packet.lockToken, null);
    await signatureAction("user-1", id, "send", 1);
    assert.equal(providerCreates, 1);
    assert.equal(sends, 1);
  } finally {
    mocks.forEach((m) => m.mock.restore());
  }
});

test("lost create response stays recoverable and never blindly creates a second request", async () => {
  reset();
  const mocks = [
    mock.method(Documenso.prototype, "create", async () => {
      providerCreates++;
      throw new ISPSignatureError("Timed out", 502);
    }),
    mock.method(Documenso.prototype, "recover", async () => remote),
    mock.method(Documenso.prototype, "get", async () => remote),
    mock.method(Documenso.prototype, "send", async () => {
      sends++;
      remote = { ...remote, status: "PENDING" };
    }),
  ];
  try {
    await assert.rejects(signatureAction("user-1", id, "send", 1));
    assert.equal(packet.state, "preparing");
    assert.equal(packet.lockToken, null);
    await signatureAction("user-1", id, "sync");
    assert.equal(packet.state, "ready");
    assert.equal(packet.providerId, remote.id);
    await signatureAction("user-1", id, "send", 1);
    assert.equal(providerCreates, 1);
    assert.equal(sends, 1);
  } finally {
    mocks.forEach((m) => m.mock.restore());
  }
});

test("stale review and simultaneous actions cause no provider calls", async () => {
  reset();
  const create = mock.method(Documenso.prototype, "create", async () => {
    providerCreates++;
    return remote.id;
  });
  try {
    await assert.rejects(
      signatureAction("user-1", id, "send", 2),
      /changed since review/,
    );
    concurrent = true;
    await assert.rejects(
      signatureAction("user-1", id, "send", 1),
      /Another action/,
    );
    assert.equal(providerCreates, 0);
  } finally {
    create.mock.restore();
  }
});

test("completion archives once and replayed status does not duplicate ISP files", async () => {
  reset();
  packet.state = "pending";
  packet.providerId = remote.id;
  remote = {
    ...remote,
    status: "COMPLETED",
    recipients: [
      {
        ...remote.recipients[0],
        signingStatus: "SIGNED",
        signedAt: new Date().toISOString(),
      },
    ],
  };
  const mocks = [
    mock.method(Documenso.prototype, "get", async () => remote),
    mock.method(Documenso.prototype, "download", async () =>
      new TextEncoder().encode("%PDF-test"),
    ),
  ];
  try {
    await signatureAction("user-1", id, "sync");
    assert.equal(packet.state, "completed");
    assert.ok(packet.signedKey);
    assert.ok(packet.auditKey);
    await signatureAction("user-1", id, "sync");
    assert.equal(archiveInserts, 1);
  } finally {
    mocks.forEach((m) => m.mock.restore());
  }
});

test("staff cannot invoke any signing action", async () => {
  reset();
  role = "staff";
  await assert.rejects(signatureAction("user-1", id, "send", 1), Denied);
  assert.equal(packet.lockToken, null);
});

test("lost send response is reconciled without emailing recipients twice", async () => {
  reset();
  packet.state = "ready";
  packet.providerId = remote.id;
  const mocks = [
    mock.method(Documenso.prototype, "get", async () => remote),
    mock.method(Documenso.prototype, "send", async () => {
      sends++;
      remote = { ...remote, status: "PENDING" };
      throw new ISPSignatureError("Timeout", 502);
    }),
  ];
  try {
    await assert.rejects(signatureAction("user-1", id, "send", 1));
    assert.equal(packet.state, "sending");
    await signatureAction("user-1", id, "send", 1);
    assert.equal(packet.state, "pending");
    assert.equal(sends, 1);
  } finally {
    mocks.forEach((m) => m.mock.restore());
  }
});

test("reminders target only unsigned recipients and are throttled even after a timeout", async () => {
  reset();
  packet.state = "pending";
  packet.providerId = remote.id;
  packet.draft = {
    ...draft,
    signers: [
      ...draft.signers,
      {
        name: "Already Signed",
        email: "signed@example.test",
        role: "Participant",
      },
    ],
  };
  remote = {
    ...remote,
    status: "PENDING",
    recipients: [
      ...remote.recipients,
      {
        id: 2,
        name: "Already Signed",
        email: "signed@example.test",
        role: "SIGNER",
        signingStatus: "SIGNED",
        signedAt: new Date().toISOString(),
      },
    ],
  };
  let reminders = 0;
  const mocks = [
    mock.method(Documenso.prototype, "get", async () => remote),
    mock.method(
      Documenso.prototype,
      "remind",
      async (_id: string, recipients: number[]) => {
        reminders++;
        assert.deepEqual(recipients, [1]);
        throw new ISPSignatureError("Timeout", 502);
      },
    ),
  ];
  try {
    await assert.rejects(signatureAction("user-1", id, "remind"));
    await assert.rejects(signatureAction("user-1", id, "remind"), /last hour/);
    assert.equal(reminders, 1);
  } finally {
    mocks.forEach((m) => m.mock.restore());
  }
});
