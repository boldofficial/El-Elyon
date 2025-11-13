import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
// import { Id } from "./_generated/dataModel";

// Helper: Get user role doc
async function getUserRoleDoc(ctx: any, clerkUserId: string) {
  return await ctx.db
    .query("roles")
    .withIndex("by_clerkUserId", (q: any) => q.eq("clerkUserId", clerkUserId))
    .unique();
}

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

// Helper: Check admin access
async function requireAdmin(ctx: any, clerkUserId: string) {
  const userRole = await getUserRoleDoc(ctx, clerkUserId);
  if (!userRole || userRole.role !== "admin") {
    await audit(ctx, "access_denied", clerkUserId, "admin_required");
    throw new Error("Admin access required");
  }
  return userRole;
}

// Query: Get all users with their roles
export const getAllUsersWithRoles = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    const employees = await ctx.db.query("employees").collect();
    const roles = await ctx.db.query("roles").collect();
    const auditLogs = await ctx.db.query("audit_logs").order("desc").take(1000);

    return employees.map(employee => {
      const role = roles.find(r => r.clerkUserId === employee.clerkUserId);
      const lastActivity = auditLogs.find(log => log.clerkUserId === employee.clerkUserId);

      return {
        id: employee.clerkUserId,
        name: employee.name || employee.workEmail || "Unknown User",
        email: employee.workEmail || "No email",
        role: role?.role || null,
        locations: role?.locations || [],
        lastActive: lastActivity?.timestamp || null,
        recentActivity: auditLogs
          .filter(log => log.clerkUserId === employee.clerkUserId)
          .slice(0, 5)
          .map(log => ({
            event: log.event,
            timestamp: log.timestamp,
            location: log.location,
          })),
      };
    });
  },
});

// Mutation: Update user role
export const updateUserRole = mutation({
  args: {
    clerkUserId: v.string(),
    role: v.union(v.literal("admin"), v.literal("supervisor"), v.literal("staff")),
    locations: v.array(v.string()),
  },
  handler: async (ctx, { clerkUserId: targetClerkUserId, role: newRole, locations }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    const existingRole = await getUserRoleDoc(ctx, targetClerkUserId);

    if (existingRole) {
      await ctx.db.patch(existingRole._id, {
        role: newRole,
        locations,
      });
    } else {
      await ctx.db.insert("roles", {
        clerkUserId: targetClerkUserId,
        role: newRole,
        locations,
      });
    }

    await audit(ctx, "update_user_role", clerkUserId, `targetClerkUserId=${targetClerkUserId},role=${newRole},locations=${locations.join(",")}`);

    return true;
  },
});

// Mutation: Delete user role
export const deleteUserRole = mutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId: targetClerkUserId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    const existingRole = await getUserRoleDoc(ctx, targetClerkUserId);
    if (existingRole) {
      await ctx.db.delete(existingRole._id);
    }

    await audit(ctx, "delete_user_role", clerkUserId, `targetClerkUserId=${targetClerkUserId}`);

    return true;
  },
});

// Query: Get kiosks
export const getKiosks = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    const kiosks = await ctx.db.query("kiosks").collect();
    const auditLogs = await ctx.db.query("audit_logs").order("desc").take(1000);

    return kiosks.map(kiosk => {
      const lastSeen = auditLogs.find(log => log.deviceId === kiosk.deviceId)?.timestamp;

      return {
        id: kiosk._id,
        deviceId: kiosk.deviceId,
        location: kiosk.location,
        status: kiosk.status,
        lastSeen,
      };
    });
  },
});

// Query: Get locations summary
export const getLocations = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    const residents = await ctx.db.query("residents").collect();
    const kiosks = await ctx.db.query("kiosks").collect();
    const roles = await ctx.db.query("roles").collect();

    const locationNames = [...new Set([
      ...residents.map(r => r.location),
      ...kiosks.map(k => k.location)
    ])];

    return locationNames.map(location => ({
      name: location,
      residentCount: residents.filter(r => r.location === location).length,
      kioskCount: kiosks.filter(k => k.location === location && k.status === "active").length,
      staffCount: roles.filter(r => r.role === "staff" && (r.locations || []).includes(location)).length,
    }));
  },
});

// Mutation: Register new kiosk
export const registerKiosk = mutation({
  args: {
    deviceId: v.string(),
    location: v.string(),
  },
  handler: async (ctx, { deviceId, location }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    // Check if device already exists
    const existing = await ctx.db.query("kiosks").withIndex("by_deviceId", (q: any) => q.eq("deviceId", deviceId)).unique();
    if (existing) throw new Error("Device ID already registered");

    await ctx.db.insert("kiosks", {
      name: `Kiosk ${deviceId.slice(0, 8)}`,
      deviceId,
      location,
      status: "active",
      registeredAt: Date.now(),
      registeredBy: clerkUserId,
      createdAt: Date.now(),
      createdBy: clerkUserId,
    });

    await audit(ctx, "register_kiosk", clerkUserId, `deviceId=${deviceId},location=${location}`);

    return true;
  },
});

// Mutation: Update kiosk
export const updateKiosk = mutation({
  args: {
    kioskId: v.id("kiosks"),
    location: v.string(),
    status: v.union(v.literal("active"), v.literal("disabled"), v.literal("retired")),
  },
  handler: async (ctx, { kioskId, location, status }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    await ctx.db.patch(kioskId, { location, status });

    await audit(ctx, "update_kiosk", clerkUserId, `kioskId=${kioskId},location=${location},status=${status}`);

    return true;
  },
});

// Mutation: Deactivate kiosk
export const deactivateKiosk = mutation({
  args: { kioskId: v.id("kiosks") },
  handler: async (ctx, { kioskId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    await ctx.db.patch(kioskId, { status: "disabled" });

    await audit(ctx, "deactivate_kiosk", clerkUserId, `kioskId=${kioskId}`);

    return true;
  },
});

// Mutation: Delete kiosk
export const deleteKiosk = mutation({
  args: { kioskId: v.id("kiosks") },
  handler: async (ctx, { kioskId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    await ctx.db.delete(kioskId);

    await audit(ctx, "delete_kiosk", clerkUserId, `kioskId=${kioskId}`);

    return true;
  },
});

// Query: Get audit logs with filters
export const getAuditLogs = query({
  args: {
    actor: v.optional(v.string()),
    action: v.optional(v.string()),
    location: v.optional(v.string()),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
  },
  handler: async (ctx, filters) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    const logs = await ctx.db.query("audit_logs").order("desc").take(1000);
    const employees = await ctx.db.query("employees").collect();

    return logs.map(log => {
      const actor = log.clerkUserId ? employees.find(e => e.clerkUserId === log.clerkUserId) : null;

      // Determine object type from details (PHI-free)
      let objectType = "System";
      if (log.details?.includes("residentId=")) objectType = "Resident Record";
      else if (log.details?.includes("employeeId=")) objectType = "Employee Record";
      else if (log.details?.includes("kioskId=")) objectType = "Kiosk Device";
      else if (log.details?.includes("alertId=")) objectType = "Compliance Alert";

      return {
        id: log._id,
        timestamp: log.timestamp,
        actorId: log.clerkUserId || "system",
        actorName: actor ? (actor.name || actor.workEmail || "Unknown User") : "System",
        event: log.event,
        location: log.location || "System",
        objectType,
        deviceId: log.deviceId,
      };
    });
  },
});

// Query: Get unique audit actors
export const getAuditActors = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    const employees = await ctx.db.query("employees").collect();
    const roles = await ctx.db.query("roles").collect();

    return employees.map(employee => {
      const role = roles.find(r => r.clerkUserId === employee.clerkUserId);
      return {
        id: employee.clerkUserId,
        name: employee.name || employee.workEmail || "Unknown User",
        role: role?.role || "No role",
      };
    });
  },
});

// Query: Get unique audit actions
export const getAuditActions = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    const logs = await ctx.db.query("audit_logs").collect();
    const actions = [...new Set(logs.map(log => log.event))];

    return actions.sort();
  },
});

// Query: Get unique audit locations
export const getAuditLocations = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    const logs = await ctx.db.query("audit_logs").collect();
    const locations = [...new Set(logs.map(log => log.location).filter(Boolean))];

    return locations.sort();
  },
});

// Query: Get app settings
export const getAppSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    const config = await ctx.db.query("config").first();

    return {
      complianceReminderTemplate: config?.complianceReminderTemplate || "",
      guardianInviteTemplate: config?.guardianInviteTemplate || "",
      alertWeekday: config?.alertWeekday || 1,
      alertHour: config?.alertHour || 9,
      alertMinute: config?.alertMinute || 0,
      selfieEnforced: config?.selfieEnforced || false,
    };
  },
});

// Mutation: Update app settings
export const updateAppSettings = mutation({
  args: {
    complianceReminderTemplate: v.optional(v.string()),
    guardianInviteTemplate: v.optional(v.string()),
    alertWeekday: v.optional(v.number()),
    alertHour: v.optional(v.number()),
    alertMinute: v.optional(v.number()),
    selfieEnforced: v.optional(v.boolean()),
  },
  handler: async (ctx, settings) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    await requireAdmin(ctx, clerkUserId);

    const config = await ctx.db.query("config").first();

    if (config) {
      // Update existing config
      const updates: any = {};
      if (settings.complianceReminderTemplate !== undefined) updates.complianceReminderTemplate = settings.complianceReminderTemplate;
      if (settings.guardianInviteTemplate !== undefined) updates.guardianInviteTemplate = settings.guardianInviteTemplate;
      if (settings.alertWeekday !== undefined) updates.alertWeekday = settings.alertWeekday;
      if (settings.alertHour !== undefined) updates.alertHour = settings.alertHour;
      if (settings.alertMinute !== undefined) updates.alertMinute = settings.alertMinute;
      if (settings.selfieEnforced !== undefined) updates.selfieEnforced = settings.selfieEnforced;

      await ctx.db.patch(config._id, updates);
    } else {
      // Create new config
      await ctx.db.insert("config", {
        complianceReminderTemplate: settings.complianceReminderTemplate || "",
        guardianInviteTemplate: settings.guardianInviteTemplate || "",
        alertWeekday: settings.alertWeekday || 1,
        alertHour: settings.alertHour || 9,
        alertMinute: settings.alertMinute || 0,
        selfieEnforced: settings.selfieEnforced || false,
      });
    }

    await audit(ctx, "update_app_settings", clerkUserId, `settings=${Object.keys(settings).join(",")}`);

    return true;
  },
});

// Query: Get user role (enhanced with access control)
export const getUserRole = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const clerkUserId = identity.subject;
    
    const role = await getUserRoleDoc(ctx, clerkUserId);
    return {
      role: role?.role || null,
      locations: role?.locations || [],
    };
  },
});
