import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
// import { getAuthUserId } from "@convex-dev/auth/server"; // Removed as per plan
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

// Helper: Get user role and validate access
async function getUserRoleAndValidateAccess(ctx: any, clerkUserId: string) {
  const userRole = await ctx.db
    .query("roles")
    .withIndex("by_clerkUserId", (q: any) => q.eq("clerkUserId", clerkUserId))
    .unique();
  
  if (!userRole) {
    throw new Error("Access denied: No role assigned");
  }
  
  return userRole;
}

// Helper: Check if user has access to resident's location
async function validateResidentAccess(ctx: any, clerkUserId: string, residentId: Id<"residents">) {
  const userRole = await getUserRoleAndValidateAccess(ctx, clerkUserId);
  const resident = await ctx.db.get(residentId);
  
  if (!resident) {
    throw new Error("Resident not found");
  }
  
  // Admin has access to all locations
  if (userRole.role === "admin") {
    return { userRole, resident };
  }
  
  // Check if user has access to resident's location
  if (!userRole.locations?.includes(resident.location)) {
    throw new Error("Access denied: No permission for this resident's location");
  }
  
  return { userRole, resident };
}

// Helper: Audit ISP access
async function auditISPAccess(
  ctx: any,
  ispFileId: Id<"isp_files">,
  residentId: Id<"residents">,
  clerkUserId: string,
  action: string,
  success: boolean,
  errorMessage?: string
) {
  await ctx.db.insert("isp_access_logs", {
    ispFileId,
    residentId,
    clerkUserId,
    action: action as any,
    timestamp: Date.now(),
    location: "web", // Could be enhanced to get actual location
    deviceId: "web-browser", // Could be enhanced to get device info
    success,
    errorMessage,
  });
}

// Query: List ISP files for a resident (NO PHI in response)
export const listISPFiles = query({
  args: {
    residentId: v.id("residents"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    // Validate access to resident
    const { userRole, resident } = await validateResidentAccess(ctx, clerkUserId, args.residentId);
    
    // Get ISP files for this resident
    const ispFiles = await ctx.db
      .query("isp_files")
      .withIndex("by_residentId", (q) => q.eq("residentId", args.residentId))
      .collect();
    
    // Return sanitized data (NO PHI)
    return ispFiles.map(file => ({
      id: file._id,
      versionLabel: file.versionLabel,
      effectiveDate: file.effectiveDate,
      status: file.status,
      fileName: file.fileName, // Already sanitized during upload
      fileSize: file.fileSize,
      contentType: file.contentType,
      preparedBy: file.preparedBy,
      uploadedAt: file.uploadedAt,
      activatedAt: file.activatedAt,
      archivedAt: file.archivedAt,
      // NO file content, storage IDs, or other PHI
    }));
  },
});

// Mutation: Generate upload URL for ISP file
export const generateISPUploadUrl = mutation({
  args: {
    residentId: v.id("residents"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    // Validate access to resident
    await validateResidentAccess(ctx, clerkUserId, args.residentId);
    
    // Generate upload URL
    return await ctx.storage.generateUploadUrl();
  },
});

// Mutation: Create ISP file record after upload
export const createISPFile = mutation({
  args: {
    residentId: v.id("residents"),
    versionLabel: v.string(),
    effectiveDate: v.number(),
    fileStorageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
    preparedBy: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    // Validate access to resident
    const { userRole, resident } = await validateResidentAccess(ctx, clerkUserId, args.residentId);
    
    // Validate file type (only PDF and DOCX allowed)
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    
    if (!allowedTypes.includes(args.contentType)) {
      throw new Error("Invalid file type. Only PDF and DOCX files are allowed.");
    }
    
    // Validate version label is unique for this resident
    const existingFile = await ctx.db
      .query("isp_files")
      .withIndex("by_residentId_versionLabel", (q) => 
        q.eq("residentId", args.residentId).eq("versionLabel", args.versionLabel)
      )
      .unique();
    
    if (existingFile) {
      throw new Error("Version label already exists for this resident");
    }
    
    // Sanitize filename (remove any potential PHI)
    const sanitizedFileName = args.fileName
      .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars
      .substring(0, 100); // Limit length
    
    // Validate notes don't contain PHI patterns (basic check)
    if (args.notes) {
      const phiPatterns = [
        /\b\d{3}-\d{2}-\d{4}\b/, // SSN pattern
        /\b\d{3}-\d{3}-\d{4}\b/, // Phone pattern
        /@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email pattern
      ];
      
      for (const pattern of phiPatterns) {
        if (pattern.test(args.notes)) {
          throw new Error("Notes cannot contain personal identifiers");
        }
      }
    }
    
    // Create ISP file record
    const ispFileId = await ctx.db.insert("isp_files", {
      residentId: args.residentId,
      versionLabel: args.versionLabel,
      effectiveDate: args.effectiveDate,
      status: "draft",
      fileStorageId: args.fileStorageId,
      fileName: sanitizedFileName,
      fileSize: args.fileSize,
      contentType: args.contentType,
      preparedBy: args.preparedBy,
      notes: args.notes,
      uploadedBy: clerkUserId,
      uploadedAt: Date.now(),
    });
    
    // Audit the upload
    await auditISPAccess(
      ctx,
      ispFileId,
      args.residentId,
      clerkUserId,
      "upload",
      true
    );
    
    // Also add to general audit log (no PHI)
    await ctx.db.insert("audit_logs", {
      clerkUserId,
      event: "isp_upload",
      timestamp: Date.now(),
      deviceId: "web-browser",
      location: resident.location,
      details: `version=${args.versionLabel},size=${args.fileSize}`,
    });
    
    return { success: true, ispFileId };
  },
});

// Action: Generate time-limited download URL
export const generateISPDownloadUrl = action({
  args: {
    ispFileId: v.id("isp_files"),
  },
  handler: async (ctx, args): Promise<{ downloadUrl: string; fileName: string; expiresIn: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    // Get ISP file record
    const ispFile: { fileStorageId: string; fileName: string; residentId: Id<"residents"> } | null = await ctx.runQuery(api.isp.getISPFileForDownload, {
      ispFileId: args.ispFileId,
      clerkUserId: clerkUserId, // Pass clerkUserId for access validation in internal query
    });
    
    if (!ispFile) {
      throw new Error("ISP file not found");
    }
    
    // Generate time-limited download URL (expires in 5 minutes)
    const downloadUrl: string | null = await ctx.storage.getUrl(ispFile.fileStorageId);
    
    if (!downloadUrl) {
      // Audit failed download attempt
      await ctx.runMutation(api.isp.auditISPDownload, {
        ispFileId: args.ispFileId,
        residentId: ispFile.residentId,
        clerkUserId: clerkUserId, // Pass clerkUserId for auditing
        success: false,
        errorMessage: "File not found in storage",
      });
      throw new Error("File not available");
    }
    
    // Audit successful download
    await ctx.runMutation(api.isp.auditISPDownload, {
      ispFileId: args.ispFileId,
      residentId: ispFile.residentId,
      clerkUserId: clerkUserId, // Pass clerkUserId for auditing
      success: true,
    });
    
    return {
      downloadUrl,
      fileName: ispFile.fileName,
      expiresIn: 300, // 5 minutes in seconds
    };
  },
});

// Internal query: Get ISP file for download (with access validation)
export const getISPFileForDownload = query({
  args: {
    ispFileId: v.id("isp_files"),
    clerkUserId: v.string(), // Added clerkUserId for access validation
  },
  handler: async (ctx, args) => {
    // Get ISP file
    const ispFile = await ctx.db.get(args.ispFileId);
    if (!ispFile) {
      throw new Error("ISP file not found");
    }
    
    // Validate access to resident
    await validateResidentAccess(ctx, args.clerkUserId, ispFile.residentId);
    
    return {
      fileStorageId: ispFile.fileStorageId,
      fileName: ispFile.fileName,
      residentId: ispFile.residentId,
    };
  },
});

// Internal mutation: Audit ISP download
export const auditISPDownload = mutation({
  args: {
    ispFileId: v.id("isp_files"),
    residentId: v.id("residents"),
    clerkUserId: v.string(), // Added clerkUserId for auditing
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await auditISPAccess(
      ctx,
      args.ispFileId,
      args.residentId,
      args.clerkUserId,
      "download",
      args.success,
      args.errorMessage
    );
  },
});

// Mutation: Activate ISP file (make it the active version)
export const activateISPFile = mutation({
  args: {
    ispFileId: v.id("isp_files"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    // Get ISP file
    const ispFile = await ctx.db.get(args.ispFileId);
    if (!ispFile) {
      throw new Error("ISP file not found");
    }
    
    // Validate access
    const { userRole, resident } = await validateResidentAccess(ctx, clerkUserId, ispFile.residentId);
    
    // Only supervisors and admins can activate ISP files
    if (!["admin", "supervisor"].includes(userRole.role)) {
      throw new Error("Access denied: Supervisor or admin role required");
    }
    
    // Archive any currently active ISP files for this resident
    const activeFiles = await ctx.db
      .query("isp_files")
      .withIndex("by_residentId", (q) => q.eq("residentId", ispFile.residentId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    
    for (const activeFile of activeFiles) {
      await ctx.db.patch(activeFile._id, {
        status: "archived",
        archivedBy: clerkUserId,
        archivedAt: Date.now(),
      });
    }
    
    // Activate the selected file
    await ctx.db.patch(args.ispFileId, {
      status: "active",
      activatedBy: clerkUserId,
      activatedAt: Date.now(),
    });
    
    // Audit the activation
    await auditISPAccess(
      ctx,
      args.ispFileId,
      ispFile.residentId,
      clerkUserId,
      "activate",
      true
    );
    
    // Also add to general audit log (no PHI)
    await ctx.db.insert("audit_logs", {
      clerkUserId,
      event: "isp_activate",
      timestamp: Date.now(),
      deviceId: "web-browser",
      location: resident.location,
      details: `version=${ispFile.versionLabel}`,
    });
    
    return { success: true };
  },
});

// Mutation: Delete ISP file (soft delete by archiving)
export const deleteISPFile = mutation({
  args: {
    ispFileId: v.id("isp_files"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    // Get ISP file
    const ispFile = await ctx.db.get(args.ispFileId);
    if (!ispFile) {
      throw new Error("ISP file not found");
    }
    
    // Validate access
    const { userRole, resident } = await validateResidentAccess(ctx, clerkUserId, ispFile.residentId);
    
    // Only admins can delete ISP files
    if (userRole.role !== "admin") {
      throw new Error("Access denied: Admin role required");
    }
    
    // Archive the file instead of hard delete
    await ctx.db.patch(args.ispFileId, {
      status: "archived",
      archivedBy: clerkUserId,
      archivedAt: Date.now(),
    });
    
    // Audit the deletion
    await auditISPAccess(
      ctx,
      args.ispFileId,
      ispFile.residentId,
      clerkUserId,
      "delete",
      true
    );
    
    // Also add to general audit log (no PHI)
    await ctx.db.insert("audit_logs", {
      clerkUserId,
      event: "isp_delete",
      timestamp: Date.now(),
      deviceId: "web-browser",
      location: resident.location,
      details: `version=${ispFile.versionLabel}`,
    });
    
    return { success: true };
  },
});

// Query: Get ISP access audit logs (for compliance)
export const getISPAccessLogs = query({
  args: {
    residentId: v.optional(v.id("residents")),
    clerkUserId: v.optional(v.string()), // Changed from userId: v.optional(v.id("users"))
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const clerkUserId = identity.subject;
    
    // Only admins can view audit logs
    const userRole = await getUserRoleAndValidateAccess(ctx, clerkUserId);
    if (userRole.role !== "admin") {
      throw new Error("Access denied: Admin role required");
    }
    
    let logs;
    
    // Apply filters
    if (args.residentId) {
      logs = await ctx.db
        .query("isp_access_logs")
        .withIndex("by_residentId", (q) => q.eq("residentId", args.residentId!))
        .collect();
    } else if (args.clerkUserId) { // Changed from userId
      logs = await ctx.db
        .query("isp_access_logs")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId!)) // Changed index and field
        .collect();
    } else {
      logs = await ctx.db
        .query("isp_access_logs")
        .order("desc")
        .collect();
    }
    
    // logs already collected above
    
    // Filter by date range if provided
    if (args.dateFrom || args.dateTo) {
      logs = logs.filter(log => {
        if (args.dateFrom && log.timestamp < args.dateFrom) return false;
        if (args.dateTo && log.timestamp > args.dateTo) return false;
        return true;
      });
    }
    
    // Sort by timestamp (most recent first)
    logs.sort((a, b) => b.timestamp - a.timestamp);
    
    // Limit results
    if (args.limit) {
      logs = logs.slice(0, args.limit);
    }
    
    // Get employee names for the logs
    const employees = await ctx.db.query("employees").collect();
    const employeeMap = new Map(employees.map(e => [e.clerkUserId, e.name || e.workEmail || "Unknown Employee"]));
    
    return logs.map(log => ({
      id: log._id,
      action: log.action,
      timestamp: log.timestamp,
      userName: employeeMap.get(log.clerkUserId) || "Unknown Employee", // Changed from userMap.get(log.userId)
      location: log.location,
      success: log.success,
      errorMessage: log.errorMessage,
      // NO PHI or sensitive data
    }));
  },
});
