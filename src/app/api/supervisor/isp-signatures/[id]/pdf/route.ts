import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { requireSignaturePacket } from "@/db/mutations/isp-signatures";
import { createISPSignaturePDF } from "@/lib/isp-signature-pdf";
import { generateDownloadUrl } from "@/lib/aws-s3";
import { ISPSignatureError } from "@/lib/isp-signatures";
import { privateJSON, signatureError } from "../../_shared";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return privateJSON({ error: "Unauthorized" }, 401);
    const id = z.uuid().parse((await context.params).id);
    const packet = await requireSignaturePacket(userId, id);
    const version = z
      .enum(["original", "signed", "audit"])
      .parse(new URL(request.url).searchParams.get("version") || "original");
    const key =
      version === "signed"
        ? packet.signedKey
        : version === "audit"
          ? packet.auditKey
          : packet.originalKey;
    let bytes: Uint8Array;
    if (key) {
      const result = await fetch(await generateDownloadUrl(key, 60), {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      if (!result.ok)
        throw new ISPSignatureError("Unable to load the saved PDF.", 502);
      bytes = new Uint8Array(await result.arrayBuffer());
    } else {
      if (version !== "original")
        throw new ISPSignatureError(
          "The signed document is not available yet.",
          409,
        );
      bytes = (
        await createISPSignaturePDF(packet.draft, packet.residentName, id)
      ).bytes;
    }
    return new Response(Uint8Array.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="isp-${version}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return signatureError(error);
  }
}
