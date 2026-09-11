import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  publicSignaturePacket,
  saveSignatureDraft,
  signatureAction,
} from "@/db/mutations/isp-signatures";
import { ispSignatureDraftSchema } from "@/lib/isp-signatures";
import { privateJSON, signatureError } from "../_shared";

export const maxDuration = 180;
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const { userId } = await auth();
    if (!userId) return privateJSON({ error: "Unauthorized" }, 401);
    const id = z.uuid().parse((await context.params).id);
    const body = z
      .object({
        revision: z.number().int().positive(),
        draft: ispSignatureDraftSchema,
      })
      .strict()
      .parse(await request.json());
    return privateJSON(
      publicSignaturePacket(
        await saveSignatureDraft(userId, id, body.revision, body.draft),
      ),
    );
  } catch (error) {
    return signatureError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { userId } = await auth();
    if (!userId) return privateJSON({ error: "Unauthorized" }, 401);
    const id = z.uuid().parse((await context.params).id);
    const body = z
      .object({
        action: z.enum(["send", "sync", "remind", "cancel"]),
        revision: z.number().int().positive().optional(),
      })
      .strict()
      .parse(await request.json());
    return privateJSON(
      publicSignaturePacket(
        await signatureAction(userId, id, body.action, body.revision),
      ),
    );
  } catch (error) {
    return signatureError(error);
  }
}
