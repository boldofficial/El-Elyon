import { z } from "zod";

export const ispSignerSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    role: z.string().trim().min(1).max(100),
  })
  .strict();

export const ispSignatureDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    versionLabel: z.string().trim().min(1).max(80),
    effectiveDate: z.iso.date(),
    preparedBy: z.string().trim().min(1).max(120),
    content: z.string().trim().min(1).max(60000),
    goals: z.array(z.string().trim().min(1).max(3000)).min(1).max(50),
    signers: z.array(ispSignerSchema).min(1).max(20),
  })
  .strict()
  .refine(
    (d) => new Set(d.signers.map((s) => s.email)).size === d.signers.length,
    {
      message: "Each signer must have a different email address.",
      path: ["signers"],
    },
  );

export type ISPSignatureDraft = z.infer<typeof ispSignatureDraftSchema>;
export type ISPSignerStatus = {
  email: string;
  name: string;
  status: string;
  signedAt: string | null;
};
export type ISPSignatureState =
  | "draft"
  | "preparing"
  | "ready"
  | "sending"
  | "pending"
  | "completed"
  | "rejected"
  | "cancelled";

export class ISPSignatureError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function canManageISPSignatures(
  role: string,
  locations: string[],
  location: string,
) {
  return (
    role === "admin" || (role === "supervisor" && locations.includes(location))
  );
}

export const signatureStateLabels: Record<ISPSignatureState, string> = {
  draft: "Draft",
  preparing: "Needs delivery check",
  ready: "Ready to send",
  sending: "Checking delivery",
  pending: "Awaiting signatures",
  completed: "Signed",
  rejected: "Declined",
  cancelled: "Cancelled",
};
