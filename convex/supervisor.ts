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
    deviceId: "web",
    location: "",
    details,
  });
}

// Helper: Check supervisor access
async function requireSupervisorAccess(ctx: any, clerkUserId: string) {
  const userRole = await getUserRoleDoc(ctx, clerkUserId);
  if (!userRole || !["admin", "supervisor"].includes(userRole.role)) {
    await audit(ctx, "access_denied", clerkUserId, "supervisor_access_required");
    throw new Error("Supervisor access required");
  }
  return userRole;
}

// Helper: Generate neutral resident ID for PHI-free display
function generateNeutralId(residentId: string): string {
  let hash = 0;
  for (let i = 0; i < residentId.length; i++) {
    const char = residentId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash % 9999).toString().padStart(4, '0');
}

// Query: Get team members (staff in supervisor's locations)
export const getTeamMembers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    const userRole = await requireSupervisorAccess(ctx, clerkUserId);
    
    // Get all staff roles in supervisor's locations
    const allRoles = await ctx.db.query("roles").collect();
    const teamRoles = allRoles.filter(role => 
      role.role === "staff" && 
      role.locations && role.locations.some(loc => userRole.locations.includes(loc))
    );
    
    // Get user details and shift status for each team member
    const teamMembers = await Promise.all(
      teamRoles.map(async (role) => {
        const employee = await ctx.db
          .query("employees")
          .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", role.clerkUserId))
          .first();
        if (!employee) return null;
        
        // Check if currently clocked in - need to add shifts table to schema
        const isCurrentlyClocked = false; // Placeholder
        const lastClockIn = null; // Placeholder
        
        return {
          id: role.clerkUserId,
          name: employee.name || "Unknown",
          role: role.role,
          locations: role.locations ? role.locations.filter(loc => userRole.locations.includes(loc)) : [],
          isCurrentlyClocked,
          lastClockIn,
        };
      })
    );
    
    return teamMembers.filter(Boolean);
  },
});

// Query: Get pending time exceptions
export const getPendingTimeExceptions = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    await requireSupervisorAccess(ctx, clerkUserId);
    
    // For now, return empty array - time exceptions would be implemented
    // based on shift data analysis
    return [];
  },
});

// Mutation: Approve time exception
export const approveTimeException = mutation({
  args: { exceptionId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    await requireSupervisorAccess(ctx, clerkUserId);
    
    // Implementation would update shift record with approval
    await audit(ctx, "approve_time_exception", clerkUserId, `exceptionId=${args.exceptionId}`);
    
    return true;
  },
});

// Mutation: Deny time exception
export const denyTimeException = mutation({
  args: { 
    exceptionId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    await requireSupervisorAccess(ctx, clerkUserId);
    
    // Implementation would update shift record with denial
    await audit(ctx, "deny_time_exception", clerkUserId, `exceptionId=${args.exceptionId},reason=${args.reason}`);
    
    return true;
  },
});

// Query: Get location ISPs
export const getLocationIsps = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    const userRole = await requireSupervisorAccess(ctx, clerkUserId);
    
    // Get residents in supervisor's locations
    // Admin can see all residents, supervisors see only their assigned locations
    const residents = await ctx.db.query("residents").collect();
    const locationResidents = userRole.role === "admin" 
      ? residents 
      : residents.filter(r => userRole.locations && userRole.locations.includes(r.location));
    
    // Get ISPs for these residents
    const isps = [];
    for (const resident of locationResidents) {
      const residentIsps = await ctx.db
        .query("isp")
        .withIndex("by_residentId", (q) => q.eq("residentId", resident._id))
        .order("desc")
        .collect();
      
      for (const isp of residentIsps) {
        isps.push({
          id: isp._id,
          residentNeutralId: generateNeutralId(resident._id),
          version: isp.version || 1,
          published: isp.published,
          content: isp.content || "",
          goals: isp.goals || [],
          createdAt: isp.createdAt,
          dueAt: isp.dueAt,
        });
      }
    }
    
    return isps.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },
});

// Query: Get ISP acknowledgment status
export const getIspAcknowledgments = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    const userRole = await requireSupervisorAccess(ctx, clerkUserId);
    
    // Get published ISPs for residents in supervisor's locations
    // Admin can see all residents, supervisors see only their assigned locations
    const residents = await ctx.db.query("residents").collect();
    const locationResidents = userRole.role === "admin"
      ? residents
      : residents.filter(r => userRole.locations && userRole.locations.includes(r.location));
    
    const acknowledgments = [];
    
    for (const resident of locationResidents) {
      const publishedIsps = await ctx.db
        .query("isp")
        .withIndex("by_residentId", (q) => q.eq("residentId", resident._id))
        .filter((q) => q.eq(q.field("published"), true))
        .collect();
      
      for (const isp of publishedIsps) {
        // Get all staff who need to acknowledge this ISP
        const staffRoles = await ctx.db.query("roles").collect();
        const relevantStaff = staffRoles.filter(role => 
          role.role === "staff" && 
          role.locations && role.locations.includes(resident.location)
        );
        
        for (const staffRole of relevantStaff) {
          const employee = await ctx.db
            .query("employees")
            .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", staffRole.clerkUserId))
            .first();
          if (!employee) continue;
          
          const acknowledgment = await ctx.db
            .query("isp_acknowledgments")
            .withIndex("by_resident_and_user", (q) => 
              q.eq("residentId", resident._id).eq("clerkUserId", staffRole.clerkUserId)
            )
            .filter((q) => q.eq(q.field("ispId"), isp._id))
            .first();
          
          acknowledgments.push({
            ispId: isp._id,
            ispVersion: isp.version || 1,
            residentNeutralId: generateNeutralId(resident._id),
            location: resident.location,
            clerkUserId: staffRole.clerkUserId,
            userName: employee.name,
            acknowledgedAt: acknowledgment?.acknowledgedAt,
          });
        }
      }
    }
    
    return acknowledgments.sort((a, b) => {
      // Sort by acknowledgment status, then by resident
      if (a.acknowledgedAt && !b.acknowledgedAt) return 1;
      if (!a.acknowledgedAt && b.acknowledgedAt) return -1;
      return a.residentNeutralId.localeCompare(b.residentNeutralId);
    });
  },
});

// Mutation: Create ISP
export const createIsp = mutation({
  args: {
    residentId: v.id("residents"),
    content: v.string(),
    goals: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    const userRole = await requireSupervisorAccess(ctx, clerkUserId);
    
    const resident = await ctx.db.get(args.residentId);
    if (!resident) throw new Error("Resident not found");
    
    // Check location access
    if (!userRole.locations.includes(resident.location)) {
      await audit(ctx, "access_denied", clerkUserId, `resident_access_denied=${args.residentId}`);
      throw new Error("Access denied to this resident");
    }
    
    // Get next version number
    const lastIsp = await ctx.db
      .query("isp")
      .withIndex("by_residentId", (q) => q.eq("residentId", args.residentId))
      .order("desc")
      .first();
    
    const version = (lastIsp?.version || 0) + 1;
    
    const ispId = await ctx.db.insert("isp", {
      residentId: args.residentId,
      published: false,
      content: args.content,
      goals: args.goals,
      version,
      createdAt: Date.now(),
      dueAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from now
    });
    
    await audit(ctx, "create_isp", clerkUserId, `residentId=${args.residentId},ispId=${ispId},version=${version}`);
    
    return { ispId };
  },
});

// Mutation: Publish ISP
export const publishIsp = mutation({
  args: { ispId: v.id("isp") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    const userRole = await requireSupervisorAccess(ctx, clerkUserId);
    
    const isp = await ctx.db.get(args.ispId);
    if (!isp) throw new Error("ISP not found");
    
    const resident = await ctx.db.get(isp.residentId);
    if (!resident) throw new Error("Resident not found");
    
    // Check location access
    if (!userRole.locations.includes(resident.location)) {
      await audit(ctx, "access_denied", clerkUserId, `resident_access_denied=${isp.residentId}`);
      throw new Error("Access denied to this resident");
    }
    
    if (isp.published) {
      throw new Error("ISP already published");
    }
    
    await ctx.db.patch(args.ispId, {
      published: true,
    });
    
    await audit(ctx, "publish_isp", clerkUserId, `ispId=${args.ispId},residentId=${isp.residentId}`);
    
    return true;
  },
});
