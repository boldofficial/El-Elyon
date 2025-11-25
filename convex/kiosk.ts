
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
// import { getAuthUserId } from "@convex-dev/auth/server"; // Removed as per plan
// import { Id } from "./_generated/dataModel"; // Removed as Id<"users"> is no longer used

// Helper: Audit
async function audit(ctx: any, event: string, clerkUserId: string | null, details?: string) {
  await ctx.db.insert("audit_logs", {
    clerkUserId: clerkUserId ?? undefined,
    event,
    timestamp: Date.now(),
    deviceId: "system",
    location: "",
    details,
  });
}

// Resident Logs

export const listResidentLogs = query({
  args: { residentId: v.id("residents") },
  handler: async (ctx, { residentId }) => {
    const logs = await ctx.db
      .query("resident_logs")
      .withIndex("by_residentId", (q) => q.eq("residentId", residentId))
      .order("desc")
      .collect();
    const employeeClerkUserIds = Array.from(new Set(logs.map(l => l.authorId).filter((id): id is string => id !== undefined)));
    const employees = await Promise.all(employeeClerkUserIds.map(clerkUserId => ctx.db.query("employees").withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId)).unique()));
    const clerkUserIdToName: Record<string, string> = {};
    employees.forEach(e => {
      if (e) clerkUserIdToName[e.clerkUserId as string] = e.name || e.workEmail || "Unknown";
    });
    return logs.map(log => ({
      ...log,
      authorName: log.authorId ? (clerkUserIdToName[log.authorId] || "Unknown") : "Unknown",
    }));
  },
});

export const canLogForResident = query({
  args: { residentId: v.id("residents") },
  handler: async (ctx, { residentId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    const clerkUserId = identity.subject;
    const currentIsp = await ctx.db
      .query("isp")
      .withIndex("by_residentId", (q) => q.eq("residentId", residentId))
      .order("desc")
      .first();
    if (!currentIsp || !currentIsp.published) return true;
    const ack = await ctx.db
      .query("isp_acknowledgments")
      .withIndex("by_resident_and_user", (q) =>
        q.eq("residentId", residentId).eq("clerkUserId", clerkUserId)
      )
      .first();
    return !!(ack && ack.ispId === currentIsp._id);
  },
});

export const acknowledgeIsp = mutation({
  args: { residentId: v.id("residents") },
  handler: async (ctx, { residentId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    const currentIsp = await ctx.db
      .query("isp")
      .withIndex("by_residentId", (q) => q.eq("residentId", residentId))
      .order("desc")
      .first();
    if (!currentIsp || !currentIsp.published) throw new Error("No published ISP");
    const ack = await ctx.db
			.query('isp_acknowledgments')
			.withIndex('by_resident_and_user', (q) =>
				q.eq('residentId', residentId).eq('clerkUserId', clerkUserId)
			)
			.first();
    if (ack && ack.ispId === currentIsp._id) return true;
    await ctx.db.insert("isp_acknowledgments", {
      residentId,
      clerkUserId,
      ispId: currentIsp._id,
      acknowledgedAt: Date.now(),
      acknowledgedIsp: currentIsp._id,
    });
    return true;
  },
});

export const createResidentLog = mutation({
  args: {
    residentId: v.id("residents"),
    template: v.string(),
    fields: v.object({ mood: v.string(), notes: v.string() }),
  },
  handler: async (ctx, { residentId, template, fields }) => {
    const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		if (!clerkUserId) throw new Error('Not authenticated');
    // Check if user can log for this resident
    const currentIsp = await ctx.db
      .query("isp")
      .withIndex("by_residentId", (q) => q.eq("residentId", residentId))
      .order("desc")
      .first();
    if (currentIsp && currentIsp.published) {
      const ack = await ctx.db
        .query("isp_acknowledgments")
        .withIndex("by_resident_and_user", (q) =>
          q.eq("residentId", residentId).eq("clerkUserId", clerkUserId)
        )
        .first();
      if (!ack || ack.ispId !== currentIsp._id) {
        throw new Error("Must acknowledge ISP before logging");
      }
    }

    const latest = await ctx.db
      .query("resident_logs")
      .withIndex("by_residentId", (q) => q.eq("residentId", residentId))
      .order("desc")
      .first();
    const version = latest ? (typeof latest.version === 'number' ? latest.version + 1 : 1) : 1;
    
    const resident = await ctx.db.get(residentId);
    if (!resident) throw new Error("Resident not found");
    
    await ctx.db.insert("resident_logs", {
      residentId,
      authorId: clerkUserId,
      version,
      template,
      content: JSON.stringify(fields),
      location: resident.location,
      createdAt: Date.now(),
    });
    return true;
  },
});

export const editResidentLog = mutation({
  args: {
    logId: v.id("resident_logs"),
    fields: v.object({ mood: v.string(), notes: v.string() }),
  },
  handler: async (ctx, { logId, fields }) => {
    const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		if (!clerkUserId) throw new Error('Not authenticated');
    const log = await ctx.db.get(logId);
    if (!log) throw new Error("Log not found");
    if (log.authorId !== clerkUserId) throw new Error("Not your log");
    const latest = await ctx.db
      .query("resident_logs")
      .withIndex("by_residentId", (q) => q.eq("residentId", log.residentId))
      .order("desc")
      .first();
    const version = latest ? (typeof latest.version === 'number' ? latest.version + 1 : 1) : 1;
    
    const resident = await ctx.db.get(log.residentId);
    if (!resident) throw new Error("Resident not found");
    
    await ctx.db.insert("resident_logs", {
      residentId: log.residentId,
      authorId: clerkUserId,
      version,
      template: log.template,
      content: JSON.stringify(fields),
      location: resident.location,
      createdAt: Date.now(),
    });
    return true;
  },
});

// ISP

export const getCurrentIsp = query({
  args: { residentId: v.id("residents") },
  handler: async (ctx, { residentId }) => {
    const isp = await ctx.db
      .query("isp")
      .withIndex("by_residentId", (q) => q.eq("residentId", residentId))
      .order("desc")
      .first();
    return isp || null;
  },
});

export const listResidentIsps = query({
  args: { residentId: v.id("residents") },
  handler: async (ctx, { residentId }) => {
    const isps = await ctx.db
      .query("isp")
      .withIndex("by_residentId", (q) => q.eq("residentId", residentId))
      .order("desc")
      .collect();
    return isps;
  },
});

export const authorIsp = mutation({
  args: { residentId: v.id("residents"), content: v.string() },
  handler: async (ctx, { residentId, content }) => {
    const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		if (!clerkUserId) throw new Error('Not authenticated');
    const latest = await ctx.db
      .query("isp")
      .withIndex("by_residentId", (q) => q.eq("residentId", residentId))
      .order("desc")
      .first();
    const version = latest ? (latest.version || 0) + 1 : 1;
    await ctx.db.insert("isp", {
      residentId,
      published: false,
      dueAt: undefined,
      createdAt: Date.now(),
      version,
      goals: [],
      content,
    });
    return true;
  },
});

export const publishIsp = mutation({
  args: { residentId: v.id("residents") },
  handler: async (ctx, { residentId }) => {
    const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		if (!clerkUserId) throw new Error('Not authenticated');
    const latest = await ctx.db
      .query("isp")
      .withIndex("by_residentId", (q) => q.eq("residentId", residentId))
      .order("desc")
      .first();
    if (!latest) throw new Error("No ISP draft found");
    await ctx.db.patch(latest._id, { published: true, dueAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
    return true;
  },
});

export const listIspAcknowledgments = query({
  args: { residentId: v.id("residents") },
  handler: async (ctx, { residentId }) => {
    const acks = await ctx.db
      .query("isp_acknowledgments")
      .withIndex("by_resident_and_user", (q) => q.eq("residentId", residentId))
      .collect();
    return acks;
  },
});

// Documents

export const listResidentDocuments = query({
  args: { residentId: v.id("residents") },
  handler: async (ctx, { residentId }) => {
    return [];
  },
});

export const getResidentDocumentUrl = mutation({
  args: { fileId: v.id("_storage"), residentId: v.id("residents") },
  handler: async (ctx, { fileId }) => {
    const url = await ctx.storage.getUrl(fileId);
    return url;
  },
});

// Audit trail

export const getResidentAuditTrail = query({
  args: { residentId: v.id("residents") },
  handler: async (ctx, { residentId }) => {
    return [];
  },
});

// Kiosk management functions

export const listKiosks = query({
  args: {},
  handler: async (ctx) => {
    // const userId = await getAuthUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

    if (!clerkUserId) throw new Error("Not authenticated");
    const kiosks = await ctx.db.query("kiosks").collect();
    return kiosks.map(kiosk => ({
      id: kiosk._id,
      deviceId: kiosk.deviceId,
      deviceLabel: kiosk.deviceLabel,
      location: kiosk.location,
      status: kiosk.status ?? "active",
      registeredAt: kiosk.registeredAt,
      lastSeenAt: kiosk.lastSeenAt,
    }));
  },
});

export const listPairingTokens = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		if (!clerkUserId) throw new Error('Not authenticated');
    const tokens = await ctx.db
      .query("kiosk_pairing_tokens")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return tokens.map(token => ({
      id: token._id,
      token: token.token,
      deviceId: token.deviceId,
      location: token.location,
      deviceLabel: token.deviceLabel,
      expiresAt: token.expiresAt,
      issuedAt: token.issuedAt,
      status: token.status,
    }));
  },
});

export const createKioskPairing = mutation({
  args: {
    location: v.string(),
    deviceLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		if (!clerkUserId) throw new Error('Not authenticated');
    const token = Array.from({ length: 8 }, () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      return chars.charAt(Math.floor(Math.random() * chars.length));
    }).join('');
    const now = Date.now();
    const expiresAt = now + 15 * 60 * 1000;
    const pairingId = await ctx.db.insert("kiosk_pairing_tokens", {
      token,
      deviceId: "",
      location: args.location,
      deviceLabel: args.deviceLabel,
      expiresAt,
      issuedBy: clerkUserId,
      issuedAt: now,
      usedAt: undefined,

      status: "active",
    });
    return {
      id: pairingId,
      token,
      location: args.location,
      deviceLabel: args.deviceLabel,
      expiresAt,
    };
  },
});

export const updateKioskLabel = mutation({
  args: {
    kioskId: v.id("kiosks"),
    deviceLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		if (!clerkUserId) throw new Error('Not authenticated');
    await ctx.db.patch(args.kioskId, { deviceLabel: args.deviceLabel });
    return { success: true };
  },
});

// Query: List available kiosk devices for employee assignment
export const listAvailableKioskDevices = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    // Only admins can view available devices for assignment
    const userRole = await ctx.db
      .query("roles")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();

    if (!userRole || userRole.role !== "admin") {
      throw new Error("Admin access required to list devices");
    }

    const kiosks = await ctx.db
      .query("kiosks")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    return kiosks.map((kiosk) => ({
      deviceId: kiosk.deviceId,
      deviceLabel: kiosk.deviceLabel || kiosk.name || kiosk.deviceId,
      location: kiosk.location,
    }));
  },
});

export const updateKioskStatus = mutation({
  args: {
    kioskId: v.id("kiosks"),
    status: v.union(
      v.literal("active"),
      v.literal("disabled"),
      v.literal("retired")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		if (!clerkUserId) throw new Error('Not authenticated');
    await ctx.db.patch(args.kioskId, { status: args.status });
    return { success: true };
  },
});

export const getKioskByDeviceId = query({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const kiosk = await ctx.db
      .query("kiosks")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .unique();
    if (!kiosk) return null;
    return {
      id: kiosk._id,
      deviceId: kiosk.deviceId,
      deviceLabel: kiosk.deviceLabel,
      location: kiosk.location,
      status: kiosk.status ?? "active",
      registeredAt: kiosk.registeredAt,
      lastSeenAt: kiosk.lastSeenAt,
      isActive: kiosk.status === "active" || kiosk.status === undefined,
    };
  },
});

export const updateKioskLastSeen = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const kiosk = await ctx.db
      .query("kiosks")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .unique();
    if (!kiosk) return { success: false };
    await ctx.db.patch(kiosk._id, { lastSeenAt: Date.now() });
    return { success: true };
  },
});

export const completePairing = mutation({
  args: {
    token: v.string(),
    kioskIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const pairing = await ctx.db
      .query("kiosk_pairing_tokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!pairing) throw new Error("Invalid pairing token");
    if (pairing.status !== "active") throw new Error("Token already used or expired");
    if (pairing.expiresAt < Date.now()) throw new Error("Token expired");
    const deviceId = Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    const kioskId = await ctx.db.insert("kiosks", {
      name: pairing.deviceLabel || `Kiosk ${deviceId.slice(0, 8)}`,
      deviceId,
      deviceLabel: pairing.deviceLabel,
      location: pairing.location,
      status: "active",
      registeredAt: Date.now(),
      registeredBy: pairing.issuedBy,
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
      createdBy: pairing.issuedBy,
    });
    await ctx.db.patch(pairing._id, {
      deviceId,
      usedAt: Date.now(),

      status: "used",
    });
    return {
      deviceId,
      location: pairing.location,
      deviceLabel: pairing.deviceLabel,
      kioskId,
    };
  },
});

export const deleteKiosk = mutation({
  args: {
    kioskId: v.id("kiosks"),
  },
  handler: async (ctx, args) => {
   const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		if (!clerkUserId) throw new Error('Not authenticated');
    const kiosk = await ctx.db.get(args.kioskId);
    if (!kiosk) throw new Error("Kiosk not found");
    await ctx.db.delete(args.kioskId);
    await ctx.db.insert("audit_logs", {
      clerkUserId: clerkUserId ?? undefined,
      event: "kiosk_deleted",
      timestamp: Date.now(),
      deviceId: kiosk.deviceId,
      location: kiosk.location,
      details: `kioskId=${args.kioskId}`,
    });
    return { success: true };
  },
});
