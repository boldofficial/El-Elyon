import { z } from "zod";
import { syncSignatureEnvelope } from "@/db/mutations/isp-signatures";
import { verifyDocumensoWebhook } from "@/lib/documenso-webhook";
import { ISPSignatureError } from "@/lib/isp-signatures";
import {
  privateJSON,
  signatureError,
} from "../../supervisor/isp-signatures/_shared";

export const maxDuration = 180;

export async function POST(request: Request) {
  if (
    !verifyDocumensoWebhook(
      request.headers.get("x-documenso-secret"),
      process.env.DOCUMENSO_WEBHOOK_SECRET,
    )
  )
    return privateJSON({ error: "Unauthorized" }, 401);
  try {
    const body = z
      .object({
        event: z.string(),
        payload: z.object({ envelopeId: z.string().min(1).max(255) }),
      })
      .parse(await request.json());
    if (
      [
        "DOCUMENT_SENT",
        "DOCUMENT_SIGNED",
        "DOCUMENT_RECIPIENT_COMPLETED",
        "DOCUMENT_COMPLETED",
        "DOCUMENT_REJECTED",
        "DOCUMENT_CANCELLED",
      ].includes(body.event)
    )
      await syncSignatureEnvelope(body.payload.envelopeId);
    return privateJSON({ received: true });
  } catch (error) {
    // Request retries when a send or another callback currently owns the packet.
    if (error instanceof ISPSignatureError && error.status === 409)
      return privateJSON({ error: "Please retry this notification." }, 503);
    return signatureError(error);
  }
}
