import { internalMutation } from "./_generated/server"; // Changed to internalMutation
import { v } from "convex/values";

export const log = internalMutation({ // Changed to internalMutation
  args: {
    clerkUserId: v.optional(v.string()),
    event: v.string(),
    timestamp: v.optional(v.number()),
    deviceId: v.string(),
    location: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("audit_logs", {
      clerkUserId: args.clerkUserId,
      event: args.event,
      timestamp: args.timestamp || Date.now(),
      deviceId: args.deviceId,
      location: args.location,
      details: args.details,
    });
  },
});
