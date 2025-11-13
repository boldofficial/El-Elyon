import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
// import { getAuthUserId } from "@convex-dev/auth/server"; // Removed as per plan
// import { Id } from "./_generated/dataModel"; // Removed as Id<"users"> is no longer used

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

// Query: Scan for orphaned data
export const scanOrphanedData = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    await requireAdmin(ctx, clerkUserId);

    const orphanedData: Record<string, Array<any>> = {
      roles: [],
      shifts: [],
      residentLogs: [],
      auditLogs: [],
      ispFiles: [],
      ispAccessLogs: [],
      ispAcknowledgments: [],
      fireEvac: [],
      guardianChecklistLinks: [],
      guardians: [],
      complianceAlerts: [],
      kiosks: [],
      employees: [], // Added for orphaned employees
    };

    // Get all employees for reference
    const allEmployees = await ctx.db.query("employees").collect();
    const employeeClerkUserIds = new Set(allEmployees.map(e => e.clerkUserId));

    // Get all residents for reference
    const allResidents = await ctx.db.query("residents").collect();
    const residentIds = new Set(allResidents.map(r => r._id));

    // Get all ISP files for reference
    const allISPFiles = await ctx.db.query("isp_files").collect();
    const ispFileIds = new Set(allISPFiles.map(f => f._id));

    // Get all ISPs for reference
    const allISPs = await ctx.db.query("isp").collect();
    const ispIds = new Set(allISPs.map(i => i._id));

    // Get all kiosks for reference
    const allKiosks = await ctx.db.query("kiosks").collect();
    const kioskIds = new Set(allKiosks.map(k => k._id));

    // 1. Check roles with non-existent employees
    const roles = await ctx.db.query("roles").collect();
    for (const role of roles) {
      if (!employeeClerkUserIds.has(role.clerkUserId)) {
        orphanedData.roles.push({
          id: role._id,
          clerkUserId: role.clerkUserId,
          role: role.role,
          reason: "Employee does not exist",
        });
      }
    }

    // 2. Check shifts with non-existent employees or kiosks
    const shifts = await ctx.db.query("shifts").collect();
    for (const shift of shifts) {
      if (!employeeClerkUserIds.has(shift.clerkUserId)) {
        orphanedData.shifts.push({
          id: shift._id,
          clerkUserId: shift.clerkUserId,
          location: shift.location,
          reason: "Employee does not exist",
        });
      } else if (shift.kioskId && !kioskIds.has(shift.kioskId)) {
        orphanedData.shifts.push({
          id: shift._id,
          clerkUserId: shift.clerkUserId,
          kioskId: shift.kioskId,
          reason: "Kiosk does not exist",
        });
      }
    }

    // 3. Check resident_logs with non-existent residents or employees
    const residentLogs = await ctx.db.query("resident_logs").collect();
    for (const log of residentLogs) {
      if (!residentIds.has(log.residentId)) {
        orphanedData.residentLogs.push({
          id: log._id,
          residentId: log.residentId,
          reason: "Resident does not exist",
        });
      } else if (log.authorId && !employeeClerkUserIds.has(log.authorId)) {
        orphanedData.residentLogs.push({
          id: log._id,
          residentId: log.residentId,
          authorId: log.authorId,
          reason: "Author (employee) does not exist",
        });
      }
    }

    // 4. Check audit_logs with non-existent employees
    const auditLogs = await ctx.db.query("audit_logs").collect();
    for (const log of auditLogs) {
      if (log.clerkUserId && !employeeClerkUserIds.has(log.clerkUserId)) {
        orphanedData.auditLogs.push({
          id: log._id,
          clerkUserId: log.clerkUserId,
          event: log.event,
          reason: "Employee does not exist",
        });
      }
    }

    // 5. Check isp_files with non-existent residents or employees
    const ispFiles = await ctx.db.query("isp_files").collect();
    for (const file of ispFiles) {
      if (!residentIds.has(file.residentId)) {
        orphanedData.ispFiles.push({
          id: file._id,
          residentId: file.residentId,
          versionLabel: file.versionLabel,
          reason: "Resident does not exist",
        });
      } else if (!employeeClerkUserIds.has(file.uploadedBy)) {
        orphanedData.ispFiles.push({
          id: file._id,
          residentId: file.residentId,
          uploadedBy: file.uploadedBy,
          reason: "Uploader (employee) does not exist",
        });
      }
    }

    // 6. Check isp_access_logs with non-existent ISP files, residents, or employees
    const ispAccessLogs = await ctx.db.query("isp_access_logs").collect();
    for (const log of ispAccessLogs) {
      if (!ispFileIds.has(log.ispFileId)) {
        orphanedData.ispAccessLogs.push({
          id: log._id,
          ispFileId: log.ispFileId,
          reason: "ISP file does not exist",
        });
      } else if (!residentIds.has(log.residentId)) {
        orphanedData.ispAccessLogs.push({
          id: log._id,
          residentId: log.residentId,
          reason: "Resident does not exist",
        });
      } else if (!employeeClerkUserIds.has(log.clerkUserId)) {
        orphanedData.ispAccessLogs.push({
          id: log._id,
          clerkUserId: log.clerkUserId,
          reason: "Employee does not exist",
        });
      }
    }

    // 7. Check isp_acknowledgments with non-existent residents, employees, or ISPs
    const ispAcks = await ctx.db.query("isp_acknowledgments").collect();
    for (const ack of ispAcks) {
      if (!residentIds.has(ack.residentId)) {
        orphanedData.ispAcknowledgments.push({
          id: ack._id,
          residentId: ack.residentId,
          reason: "Resident does not exist",
        });
      } else if (!employeeClerkUserIds.has(ack.clerkUserId)) {
        orphanedData.ispAcknowledgments.push({
          id: ack._id,
          clerkUserId: ack.clerkUserId,
          reason: "Employee does not exist",
        });
      } else if (!ispIds.has(ack.ispId)) {
        orphanedData.ispAcknowledgments.push({
          id: ack._id,
          ispId: ack.ispId,
          reason: "ISP does not exist",
        });
      }
    }

    // 8. Check fire_evac with non-existent residents
    const fireEvacs = await ctx.db.query("fire_evac").collect();
    for (const fe of fireEvacs) {
      if (!residentIds.has(fe.residentId)) {
        orphanedData.fireEvac.push({
          id: fe._id,
          residentId: fe.residentId,
          version: fe.version,
          reason: "Resident does not exist",
        });
      }
    }

    // 9. Check guardian_checklist_links with non-existent residents
    const checklistLinks = await ctx.db.query("guardian_checklist_links").collect();
    for (const link of checklistLinks) {
      if (!residentIds.has(link.residentId)) {
        orphanedData.guardianChecklistLinks.push({
          id: link._id,
          residentId: link.residentId,
          guardianEmail: link.guardianEmail,
          reason: "Resident does not exist",
        });
      }
    }

    // 10. Check guardians with non-existent residents in residentIds array
    const guardians = await ctx.db.query("guardians").collect();
    for (const guardian of guardians) {
      if (guardian.residentIds && guardian.residentIds.length > 0) {
        const orphanedResidentIds = guardian.residentIds.filter(rid => !residentIds.has(rid));
        if (orphanedResidentIds.length > 0) {
          orphanedData.guardians.push({
            id: guardian._id,
            name: guardian.name,
            orphanedResidentIds,
            reason: "Contains references to non-existent residents",
          });
        }
      }
    }

    // 11. Check compliance_alerts with non-existent employees
    const alerts = await ctx.db.query("compliance_alerts").collect();
    for (const alert of alerts) {
      if (alert.dismissedBy && !employeeClerkUserIds.has(alert.dismissedBy)) {
        orphanedData.complianceAlerts.push({
          id: alert._id,
          type: alert.type,
          dismissedBy: alert.dismissedBy,
          reason: "Dismissed by employee does not exist",
        });
      }
    }

    // 12. Check kiosks with non-existent employees
    const kiosks = await ctx.db.query("kiosks").collect();
    for (const kiosk of kiosks) {
      if (kiosk.createdBy && !employeeClerkUserIds.has(kiosk.createdBy)) {
        orphanedData.kiosks.push({
          id: kiosk._id,
          name: kiosk.name,
          createdBy: kiosk.createdBy,
          reason: "Created by employee does not exist",
        });
      } else if (kiosk.registeredBy && !employeeClerkUserIds.has(kiosk.registeredBy)) {
        orphanedData.kiosks.push({
          id: kiosk._id,
          name: kiosk.name,
          registeredBy: kiosk.registeredBy,
          reason: "Registered by employee does not exist",
        });
      }
    }

    // 13. Check employees with no roles (new orphaned category)
    for (const employee of allEmployees) {
      const hasRole = roles.some(role => role.clerkUserId === employee.clerkUserId);
      if (!hasRole) {
        orphanedData.employees.push({
          id: employee._id,
          clerkUserId: employee.clerkUserId,
          name: employee.name,
          workEmail: employee.workEmail,
          reason: "Employee has no assigned role",
        });
      }
    }

    // Calculate totals
    const totalOrphaned = Object.values(orphanedData).reduce((sum, arr) => sum + arr.length, 0);

    return {
      orphanedData,
      totalOrphaned,
      summary: {
        roles: orphanedData.roles.length,
        shifts: orphanedData.shifts.length,
        residentLogs: orphanedData.residentLogs.length,
        auditLogs: orphanedData.auditLogs.length,
        ispFiles: orphanedData.ispFiles.length,
        ispAccessLogs: orphanedData.ispAccessLogs.length,
        ispAcknowledgments: orphanedData.ispAcknowledgments.length,
        fireEvac: orphanedData.fireEvac.length,
        guardianChecklistLinks: orphanedData.guardianChecklistLinks.length,
        guardians: orphanedData.guardians.length,
        complianceAlerts: orphanedData.complianceAlerts.length,
        kiosks: orphanedData.kiosks.length,
        employees: orphanedData.employees.length, // Added to summary
      },
    };
  },
});

// Mutation: Clean up orphaned data
export const cleanupOrphanedData = mutation({
  args: {
    categories: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    await requireAdmin(ctx, clerkUserId);

    let deletedCount = 0;
    const deletionLog: Record<string, number> = {};

    // Get all employees for reference
    const allEmployees = await ctx.db.query("employees").collect();
    const employeeClerkUserIds = new Set(allEmployees.map(e => e.clerkUserId));

    // Get all residents for reference
    const allResidents = await ctx.db.query("residents").collect();
    const residentIds = new Set(allResidents.map(r => r._id));

    // Get all ISP files for reference
    const allISPFiles = await ctx.db.query("isp_files").collect();
    const ispFileIds = new Set(allISPFiles.map(f => f._id));

    // Get all ISPs for reference
    const allISPs = await ctx.db.query("isp").collect();
    const ispIds = new Set(allISPs.map(i => i._id));

    // Get all kiosks for reference
    const allKiosks = await ctx.db.query("kiosks").collect();
    const kioskIds = new Set(allKiosks.map(k => k._id));

    // 1. Clean roles
    if (args.categories.includes("roles")) {
      const roles = await ctx.db.query("roles").collect();
      let count = 0;
      for (const role of roles) {
        if (!employeeClerkUserIds.has(role.clerkUserId)) {
          await ctx.db.delete(role._id);
          count++;
          deletedCount++;
        }
      }
      deletionLog.roles = count;
    }

    // 2. Clean shifts
    if (args.categories.includes("shifts")) {
      const shifts = await ctx.db.query("shifts").collect();
      let count = 0;
      for (const shift of shifts) {
        if (!employeeClerkUserIds.has(shift.clerkUserId) || (shift.kioskId && !kioskIds.has(shift.kioskId))) {
          await ctx.db.delete(shift._id);
          count++;
          deletedCount++;
        }
      }
      deletionLog.shifts = count;
    }

    // 3. Clean resident_logs
    if (args.categories.includes("residentLogs")) {
      const residentLogs = await ctx.db.query("resident_logs").collect();
      let count = 0;
      for (const log of residentLogs) {
        if (!residentIds.has(log.residentId) || (log.authorId && !employeeClerkUserIds.has(log.authorId))) {
          await ctx.db.delete(log._id);
          count++;
          deletedCount++;
        }
      }
      deletionLog.residentLogs = count;
    }

    // 4. Clean audit_logs
    if (args.categories.includes("auditLogs")) {
      const auditLogs = await ctx.db.query("audit_logs").collect();
      let count = 0;
      for (const log of auditLogs) {
        if (log.clerkUserId && !employeeClerkUserIds.has(log.clerkUserId)) {
          await ctx.db.delete(log._id);
          count++;
          deletedCount++;
        }
      }
      deletionLog.auditLogs = count;
    }

    // 5. Clean isp_files
    if (args.categories.includes("ispFiles")) {
      const ispFiles = await ctx.db.query("isp_files").collect();
      let count = 0;
      for (const file of ispFiles) {
        if (!residentIds.has(file.residentId) || !employeeClerkUserIds.has(file.uploadedBy)) {
          await ctx.db.delete(file._id);
          count++;
          deletedCount++;
        }
      }
      deletionLog.ispFiles = count;
    }

    // 6. Clean isp_access_logs
    if (args.categories.includes("ispAccessLogs")) {
      const ispAccessLogs = await ctx.db.query("isp_access_logs").collect();
      let count = 0;
      for (const log of ispAccessLogs) {
        if (!ispFileIds.has(log.ispFileId) || !residentIds.has(log.residentId) || !employeeClerkUserIds.has(log.clerkUserId)) {
          await ctx.db.delete(log._id);
          count++;
          deletedCount++;
        }
      }
      deletionLog.ispAccessLogs = count;
    }

    // 7. Clean isp_acknowledgments
    if (args.categories.includes("ispAcknowledgments")) {
      const ispAcks = await ctx.db.query("isp_acknowledgments").collect();
      let count = 0;
      for (const ack of ispAcks) {
        if (!residentIds.has(ack.residentId) || !employeeClerkUserIds.has(ack.clerkUserId) || !ispIds.has(ack.ispId)) {
          await ctx.db.delete(ack._id);
          count++;
          deletedCount++;
        }
      }
      deletionLog.ispAcknowledgments = count;
    }

    // 8. Clean fire_evac
    if (args.categories.includes("fireEvac")) {
      const fireEvacs = await ctx.db.query("fire_evac").collect();
      let count = 0;
      for (const fe of fireEvacs) {
        if (!residentIds.has(fe.residentId)) {
          await ctx.db.delete(fe._id);
          count++;
          deletedCount++;
        }
      }
      deletionLog.fireEvac = count;
    }

    // 9. Clean guardian_checklist_links
    if (args.categories.includes("guardianChecklistLinks")) {
      const checklistLinks = await ctx.db.query("guardian_checklist_links").collect();
      let count = 0;
      for (const link of checklistLinks) {
        if (!residentIds.has(link.residentId)) {
          await ctx.db.delete(link._id);
          count++;
          deletedCount++;
        }
      }
      deletionLog.guardianChecklistLinks = count;
    }

    // 10. Clean guardians (remove orphaned resident references)
    if (args.categories.includes("guardians")) {
      const guardians = await ctx.db.query("guardians").collect();
      let count = 0;
      for (const guardian of guardians) {
        if (guardian.residentIds && guardian.residentIds.length > 0) {
          const validResidentIds = guardian.residentIds.filter(rid => residentIds.has(rid));
          if (validResidentIds.length !== guardian.residentIds.length) {
            await ctx.db.patch(guardian._id, { residentIds: validResidentIds });
            count++;
            deletedCount++;
          }
        }
      }
      deletionLog.guardians = count;
    }

    // 11. Clean compliance_alerts (set dismissedBy to undefined)
    if (args.categories.includes("complianceAlerts")) {
      const alerts = await ctx.db.query("compliance_alerts").collect();
      let count = 0;
      for (const alert of alerts) {
        if (alert.dismissedBy && !employeeClerkUserIds.has(alert.dismissedBy)) {
          await ctx.db.patch(alert._id, { dismissedBy: undefined });
          count++;
          deletedCount++;
        }
      }
      deletionLog.complianceAlerts = count;
    }

    // 12. Clean kiosks (set createdBy/registeredBy to undefined)
    if (args.categories.includes("kiosks")) {
      const kiosks = await ctx.db.query("kiosks").collect();
      let count = 0;
      for (const kiosk of kiosks) {
        const updates: any = {};
        if (kiosk.createdBy && !employeeClerkUserIds.has(kiosk.createdBy)) {
          updates.createdBy = undefined;
        }
        if (kiosk.registeredBy && !employeeClerkUserIds.has(kiosk.registeredBy)) {
          updates.registeredBy = undefined;
        }
        if (Object.keys(updates).length > 0) {
          await ctx.db.patch(kiosk._id, updates);
          count++;
          deletedCount++;
        }
      }
      deletionLog.kiosks = count;
    }

    // 13. Clean employees (delete employees without roles)
    if (args.categories.includes("employees")) {
      const allRoles = await ctx.db.query("roles").collect();
      const roleClerkUserIds = new Set(allRoles.map(role => role.clerkUserId));
      let count = 0;
      for (const employee of allEmployees) {
        if (!roleClerkUserIds.has(employee.clerkUserId as string)) {
          await ctx.db.delete(employee._id);
          count++;
          deletedCount++;
        }
      }
      deletionLog.employees = count;
    }

    await audit(ctx, "cleanup_orphaned_data", clerkUserId, `categories=${args.categories.join(",")},deletedCount=${deletedCount}`);

    return {
      success: true,
      deletedCount,
      deletionLog,
    };
  },
});
