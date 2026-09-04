import { z } from "zod";
import { ISPSignatureError, type ISPSignatureDraft } from "./isp-signatures";
import type { SignatureField } from "./isp-signature-pdf";

const envelopeSchema = z.object({
  id: z.string(),
  externalId: z.string().nullable(),
  status: z.enum(["DRAFT", "PENDING", "COMPLETED", "REJECTED", "CANCELLED"]),
  recipients: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      email: z.email(),
      role: z.string(),
      signingStatus: z.string(),
      signedAt: z.string().nullable().optional(),
    }),
  ),
  envelopeItems: z.array(z.object({ id: z.string() })),
});
export type SigningEnvelope = z.infer<typeof envelopeSchema>;

function providerData<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new ISPSignatureError(
      "The signing server returned an unexpected response. Check its API version and refresh status.",
      502,
    );
  return parsed.data;
}

export function signingConfiguration() {
  const base = process.env.DOCUMENSO_URL;
  const token = process.env.DOCUMENSO_API_TOKEN;
  if (!base || !token)
    throw new ISPSignatureError(
      "Email signing is not configured. An administrator must connect the signing server. You can still prepare and save ISPs.",
      503,
    );
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new ISPSignatureError("The signing server address is invalid.", 503);
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  ) {
    throw new ISPSignatureError(
      "The signing server address must be an HTTPS origin.",
      503,
    );
  }
  return { origin: url.origin, token };
}

export function signingConfigured() {
  try {
    signingConfiguration();
    return true;
  } catch {
    return false;
  }
}

/** Credentials and recipient signing tokens never leave this server-side adapter. */
export class Documenso {
  private config = signingConfiguration();
  get origin() {
    return this.config.origin;
  }
  constructor(
    expectedOrigin?: string | null,
    private transport: typeof fetch = fetch,
  ) {
    if (expectedOrigin && expectedOrigin !== this.origin)
      throw new ISPSignatureError(
        "This ISP belongs to a different signing server. Restore its connection before continuing.",
        409,
      );
  }
  private async request(path: string, body?: object | FormData) {
    let response: Response;
    try {
      response = await this.transport(`${this.origin}/api/v2${path}`, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        redirect: "error",
        headers: {
          Authorization: this.config.token,
          ...(body && !(body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body:
          body instanceof FormData
            ? body
            : body
              ? JSON.stringify(body)
              : undefined,
        signal: AbortSignal.timeout(25000),
      });
    } catch {
      throw new ISPSignatureError(
        "The signing server did not respond. Refresh status before attempting to send again.",
        502,
      );
    }
    if (!response.ok)
      throw new ISPSignatureError(
        `The signing server could not complete this action (${response.status}). Refresh status before retrying.`,
        502,
      );
    return response;
  }
  async create(
    id: string,
    draft: ISPSignatureDraft,
    bytes: Uint8Array,
    fields: SignatureField[][],
  ) {
    const body = new FormData();
    body.append(
      "payload",
      JSON.stringify({
        type: "DOCUMENT",
        title: `ISP ${id}`,
        externalId: id,
        visibility: "ADMIN",
        recipients: draft.signers.map((s, i) => ({
          name: s.name,
          email: s.email,
          role: "SIGNER",
          fields: fields[i],
        })),
        meta: {
          distributionMethod: "EMAIL",
          signingOrder: "PARALLEL",
          subject: "Please review and sign your document",
          message:
            "A document is ready for your review and signature. Please use the secure link to view it.",
        },
      }),
    );
    body.append(
      "files",
      new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }),
      "individual-service-plan.pdf",
    );
    return providerData(
      z.object({ id: z.string().min(1) }),
      await (await this.request("/envelope/create", body)).json(),
    ).id;
  }
  async get(id: string) {
    return providerData(
      envelopeSchema,
      await (await this.request(`/envelope/${encodeURIComponent(id)}`)).json(),
    );
  }
  async send(id: string) {
    await this.request("/envelope/distribute", {
      envelopeId: id,
      meta: { distributionMethod: "EMAIL" },
    });
  }
  async remind(id: string, recipients: number[]) {
    await this.request("/envelope/redistribute", {
      envelopeId: id,
      recipients,
    });
  }
  async cancel(id: string) {
    await this.request("/envelope/cancel", {
      envelopeId: id,
      reason: "Withdrawn by the ISP preparer",
    });
  }
  async download(id: string, audit = false) {
    const response = await this.request(
      audit
        ? `/envelope/${encodeURIComponent(id)}/audit-log/download`
        : `/envelope/item/${encodeURIComponent(id)}/download?version=signed`,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.length > 25 * 1024 * 1024 ||
      new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
    )
      throw new ISPSignatureError(
        "The signing server returned an invalid PDF.",
        502,
      );
    return bytes;
  }
  // A timed-out create must never be blindly repeated. Find its external ID first.
  async recover(packetId: string) {
    const matches: string[] = [];
    for (let page = 1; page <= 10; page++) {
      const result = providerData(
        z.object({
          data: z.array(
            z.object({
              id: z.string(),
              externalId: z.string().nullable().optional(),
            }),
          ),
          totalPages: z.number(),
        }),
        await (
          await this.request(`/envelope?type=DOCUMENT&perPage=100&page=${page}`)
        ).json(),
      );
      matches.push(
        ...result.data
          .filter((d) => d.externalId === packetId)
          .map((d) => d.id),
      );
      if (page >= result.totalPages) {
        if (matches.length === 1) return this.get(matches[0]);
        break;
      }
    }
    throw new ISPSignatureError(
      "Delivery could not be reconciled automatically. Ask an administrator to check this ISP reference on the signing server before creating a replacement.",
      409,
    );
  }
}

export function verifyEnvelope(
  envelope: SigningEnvelope,
  id: string,
  draft: ISPSignatureDraft,
) {
  const expected = draft.signers.map((s) => s.email.toLowerCase()).sort();
  const actual = envelope.recipients
    .filter((s) => s.role === "SIGNER")
    .map((s) => s.email.toLowerCase())
    .sort();
  if (
    envelope.externalId !== id ||
    envelope.envelopeItems.length !== 1 ||
    JSON.stringify(expected) !== JSON.stringify(actual) ||
    envelope.recipients.length !== expected.length
  ) {
    throw new ISPSignatureError(
      "The signing document does not match this ISP and its recipients. Contact an administrator.",
      409,
    );
  }
  if (
    envelope.status === "COMPLETED" &&
    envelope.recipients.some((s) => s.signingStatus !== "SIGNED")
  )
    throw new ISPSignatureError(
      "The signing server has not confirmed every signature.",
      502,
    );
}
