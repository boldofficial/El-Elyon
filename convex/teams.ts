import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Helper function to get user role
async function getUserRole(ctx: any, clerkUserId: string) {
  return await ctx.db
    .query("roles")
    .withIndex("by_clerkUserId", (q: any) => q.eq("clerkUserId", clerkUserId))
    .unique();
}

// Helper function to get team member IDs based on shared locations
async function getTeamMemberIds(ctx: any, userLocations: string[]) {
  const allRoles = await ctx.db.query("roles").collect();
  return allRoles
    .filter((role: any) => 
      role.locations?.some((loc: string) => userLocations.includes(loc))
    )
    .map((role: any) => role.clerkUserId);
}

export const getTeamActivities = query({
  args: {
    staffId: v.optional(v.string()),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    const userRole = await getUserRole(ctx, clerkUserId);
    if (!userRole || !["admin", "supervisor"].includes(userRole.role)) {
      throw new Error("Access denied");
    }

    const userLocations = userRole.locations || [];
    const teamMemberIds = await getTeamMemberIds(ctx, userLocations);

    // Get logs and filter properly
    let logs = await ctx.db.query("resident_logs").collect();
    
    // Filter by team members
    logs = logs.filter(log => teamMemberIds.includes(log.authorId));
    
    // Filter by date range
    if (args.dateFrom || args.dateTo) {
      logs = logs.filter(log => {
        const logDate = log.createdAt || log._creationTime;
        if (args.dateFrom && logDate < args.dateFrom) return false;
        if (args.dateTo && logDate > args.dateTo) return false;
        return true;
      });
    }

    // Filter by specific staff member
    if (args.staffId) {
      logs = logs.filter(log => log.authorId === args.staffId);
    }

    // Sort and limit
    logs.sort((a, b) => (b.createdAt || b._creationTime) - (a.createdAt || a._creationTime));
    if (args.limit) {
      logs = logs.slice(0, args.limit);
    }

    // Enrich with user and resident data
    const employees = await ctx.db.query("employees").collect();
    const residents = await ctx.db.query("residents").collect();

    return logs.map(log => {
      const author = employees.find(e => e.clerkUserId === log.authorId);
      const resident = residents.find(r => r._id === log.residentId);
      
      return {
        id: log._id,
        residentId: log.residentId,
        residentName: resident?.name || "Unknown Resident",
        authorId: log.authorId,
        authorName: author?.name || author?.workEmail || "Unknown User",
        template: log.template,
        content: log.content,
        createdAt: log.createdAt || log._creationTime,
        location: log.location || resident?.location,
      };
    });
  },
});

export const getAllEmployeeActivities = query({
  args: {
    staffId: v.optional(v.string()),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    const userRole = await getUserRole(ctx, clerkUserId);
    if (!userRole || userRole.role !== "admin") {
      throw new Error("Admin access required");
    }

    // Get all employee IDs
    const allRoles = await ctx.db.query("roles").collect();
    const employeeIds = allRoles.map((role: any) => role.clerkUserId);

    // Get logs and filter
    let logs = await ctx.db.query("resident_logs").collect();
    
    logs = logs.filter(log => employeeIds.includes(log.authorId));
    
    if (args.dateFrom || args.dateTo) {
      logs = logs.filter(log => {
        const logDate = log.createdAt || log._creationTime;
        if (args.dateFrom && logDate < args.dateFrom) return false;
        if (args.dateTo && logDate > args.dateTo) return false;
        return true;
      });
    }

    if (args.staffId) {
      logs = logs.filter(log => log.authorId === args.staffId);
    }

    logs.sort((a, b) => (b.createdAt || b._creationTime) - (a.createdAt || a._creationTime));
    if (args.limit) {
      logs = logs.slice(0, args.limit);
    }

    const employees = await ctx.db.query("employees").collect();
    const residents = await ctx.db.query("residents").collect();

    return logs.map(log => {
      const author = employees.find(e => e.clerkUserId === log.authorId);
      const resident = residents.find(r => r._id === log.residentId);
      
      return {
        id: log._id,
        residentId: log.residentId,
        residentName: resident?.name || "Unknown Resident",
        authorId: log.authorId,
        authorName: author?.name || author?.workEmail || "Unknown User",
        template: log.template,
        content: log.content,
        createdAt: log.createdAt || log._creationTime,
        location: log.location || resident?.location,
      };
    });
  },
});

export const getTeamLogStats = query({
  args: {
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    const userRole = await getUserRole(ctx, clerkUserId);
    if (!userRole || !["admin", "supervisor"].includes(userRole.role)) {
      throw new Error("Access denied");
    }

    const userLocations = userRole.locations || [];
    const teamMemberIds = await getTeamMemberIds(ctx, userLocations);

    let logs = await ctx.db.query("resident_logs").collect();
    
    logs = logs.filter(log => teamMemberIds.includes(log.authorId));
    
    if (args.dateFrom || args.dateTo) {
      logs = logs.filter(log => {
        const logDate = log.createdAt || log._creationTime;
        if (args.dateFrom && logDate < args.dateFrom) return false;
        if (args.dateTo && logDate > args.dateTo) return false;
        return true;
      });
    }

    // Calculate stats
    const stats = {
      totalLogs: logs.length,
      logsByAuthor: {} as Record<string, number>,
      logsByTemplate: {} as Record<string, number>,
      logsByLocation: {} as Record<string, number>,
    };

    const employees = await ctx.db.query("employees").collect();
    const residents = await ctx.db.query("residents").collect();

    logs.forEach(log => {
      const author = employees.find(e => e.clerkUserId === log.authorId);
      const resident = residents.find(r => r._id === log.residentId);
      
      const authorName = author?.name || author?.workEmail || "Unknown User";
      const location = log.location || resident?.location || "Unknown Location";
      
      stats.logsByAuthor[authorName] = (stats.logsByAuthor[authorName] || 0) + 1;
      if (log.template) {
        stats.logsByTemplate[log.template] = (stats.logsByTemplate[log.template] || 0) + 1;
      }
      stats.logsByLocation[location] = (stats.logsByLocation[location] || 0) + 1;
    });

    return stats;
  },
});

// Get team members for a supervisor
export const getTeamMembers = query({
  args: {
    staffId: v.optional(v.string()),
  },
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    const userRole = await getUserRole(ctx, clerkUserId);
    if (!userRole || !["admin", "supervisor"].includes(userRole.role)) {
      throw new Error("Access denied");
    }

    const userLocations = userRole.locations || [];
    const teamMemberIds = await getTeamMemberIds(ctx, userLocations);

    const employees = await ctx.db.query("employees").collect();
    const roles = await ctx.db.query("roles").collect();

    return teamMemberIds.map((memberId: string) => {
      const employee = employees.find(e => e.clerkUserId === memberId);
      const role = roles.find(r => r.clerkUserId === memberId);
      
      return {
        id: memberId,
        name: employee?.name || employee?.workEmail || "Unknown User",
        email: employee?.workEmail,
        role: role?.role || "unknown",
        locations: role?.locations || [],
      };
    }).filter((member: any) => member.name !== "Unknown User");
  },
});

// Get all employees (admin only)
export const getAllEmployees = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    const userRole = await getUserRole(ctx, clerkUserId);
    if (!userRole || userRole.role !== "admin") {
      throw new Error("Admin access required");
    }

    const employees = await ctx.db.query("employees").collect();
    const roles = await ctx.db.query("roles").collect();

    return employees.map(employee => {
      const role = roles.find(r => r.clerkUserId === employee.clerkUserId);
      return {
        id: employee.clerkUserId,
        name: employee.name || employee.workEmail || "Unknown User",
        email: employee.workEmail,
        role: role?.role || "unknown",
        locations: role?.locations || [],
      };
    });
  },
});

// Get managed locations for supervisor
export const getManagedLocations = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    const userRole = await getUserRole(ctx, clerkUserId);
    if (!userRole) throw new Error("Access denied");

    return userRole.locations || [];
  },
});

// Get team shift summary
export const getTeamShiftSummary = query({
  args: {
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    const userRole = await getUserRole(ctx, clerkUserId);
    if (!userRole || !["admin", "supervisor"].includes(userRole.role)) {
      throw new Error("Access denied");
    }

    const userLocations = userRole.locations || [];
    const teamMemberIds = await getTeamMemberIds(ctx, userLocations);

    let shifts = await ctx.db.query("shifts").collect();
    
    // Filter by team members
    shifts = shifts.filter(shift => teamMemberIds.includes(shift.clerkUserId));
    
    // Filter by date range
    if (args.dateFrom || args.dateTo) {
      shifts = shifts.filter(shift => {
        const shiftDate = shift.clockInTime;
        if (args.dateFrom && shiftDate < args.dateFrom) return false;
        if (args.dateTo && shiftDate > args.dateTo) return false;
        return true;
      });
    }

    const employees = await ctx.db.query("employees").collect();

    return shifts.map(shift => {
      const employee = employees.find(e => e.clerkUserId === shift.clerkUserId);
      const duration = shift.clockOutTime ? shift.clockOutTime - shift.clockInTime : Date.now() - shift.clockInTime;
      
      return {
        id: shift._id,
        staffId: shift.clerkUserId,
        staffName: employee?.name || employee?.workEmail || "Unknown User",
        location: shift.location,
        clockInTime: shift.clockInTime,
        clockOutTime: shift.clockOutTime,
        duration,
        isCurrentlyWorking: !shift.clockOutTime,
      };
    });
  },
});

// Get all employee shift summary (admin only)
export const getAllEmployeeShiftSummary = query({
  args: {
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;

    const userRole = await getUserRole(ctx, clerkUserId);
    if (!userRole || userRole.role !== "admin") {
      throw new Error("Admin access required");
    }

    let shifts = await ctx.db.query("shifts").collect();
    
    if (args.dateFrom || args.dateTo) {
      shifts = shifts.filter(shift => {
        const shiftDate = shift.clockInTime;
        if (args.dateFrom && shiftDate < args.dateFrom) return false;
        if (args.dateTo && shiftDate > args.dateTo) return false;
        return true;
      });
    }

    const employees = await ctx.db.query("employees").collect();

    return shifts.map(shift => {
      const employee = employees.find(e => e.clerkUserId === shift.clerkUserId);
      const duration = shift.clockOutTime ? shift.clockOutTime - shift.clockInTime : Date.now() - shift.clockInTime;
      
      return {
        id: shift._id,
        staffId: shift.clerkUserId,
        staffName: employee?.name || employee?.workEmail || "Unknown User",
        location: shift.location,
        clockInTime: shift.clockInTime,
        clockOutTime: shift.clockOutTime,
        duration,
        isCurrentlyWorking: !shift.clockOutTime,
      };
    });
  },
});
