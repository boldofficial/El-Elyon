import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/index";
import { ispSignaturePackets } from "@/db/schema";
import {
  createSignatureDraft,
  publicSignaturePacket,
  requireSignatureResident,
} from "@/db/mutations/isp-signatures";
import { ispSignatureDraftSchema } from "@/lib/isp-signatures";
import { signingConfigured } from "@/lib/documenso";
import { privateJSON, signatureError } from "./_shared";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return privateJSON({ error: "Unauthorized" }, 401);
    const residentId = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("residentId"));
    await requireSignatureResident(userId, residentId);
    const packets = await db.query.ispSignaturePackets.findMany({
      where: eq(ispSignaturePackets.residentId, residentId),
      orderBy: desc(ispSignaturePackets.createdAt),
    });
    return privateJSON({
      configured: signingConfigured(),
      packets: packets.map(publicSignaturePacket),
    });
  } catch (error) {
    return signatureError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return privateJSON({ error: "Unauthorized" }, 401);
    const body = z
      .object({
        id: z.uuid(),
        residentId: z.uuid(),
        draft: ispSignatureDraftSchema,
      })
      .strict()
      .parse(await request.json());
    return privateJSON(
      publicSignaturePacket(
        await createSignatureDraft(
          userId,
          body.id,
          body.residentId,
          body.draft,
        ),
      ),
      201,
    );
  } catch (error) {
    return signatureError(error);
  }
}
