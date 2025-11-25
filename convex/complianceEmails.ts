import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Resend } from "resend";

// Send compliance reminder emails
export const sendComplianceReminderEmails = internalAction({
  args: {
    itemIds: v.array(v.string()),
    clerkUserId: v.string(), // Changed from userId: v.id("users")
  },
  handler: async (ctx, { itemIds, clerkUserId }): Promise<{ sent: number; total: number; results: any[] }> => {
    // Use custom Resend API key if available, otherwise fall back to Convex proxy
    const apiKey = process.env.RESEND_API_KEY || process.env.CONVEX_RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("No Resend API key configured");
    }
    const resend = new Resend(apiKey);
    
    // Get compliance items
    const items = await ctx.runQuery(internal.complianceEmails.getComplianceItemsForEmail, {
      itemIds,
    });
    
    // Get user details (employee)
    const employee = await ctx.runQuery(internal.complianceEmails.getUserForEmail, {
      clerkUserId, // Changed from userId
    });
    
    if (!employee || !employee.workEmail) { // Changed from user.email
      throw new Error("Employee not found or work email missing"); // Changed error message
    }
    
    // Get all admins and supervisors
    const recipients: any[] = await ctx.runQuery(internal.complianceEmails.getComplianceRecipients, {});
    
    const baseUrl = process.env.SITE_URL || process.env.CONVEX_SITE_URL || "https://yourdomain.com";
    
    // Group items by status
    const overdueItems = items.filter((item: any) => item.status === "overdue");
    const dueSoonItems = items.filter((item: any) => item.status === "due-soon");
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">⚠️ Compliance Reminder</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            This is a reminder about compliance items that require your attention.
          </p>
          
          ${overdueItems.length > 0 ? `
            <div style="background: #fee2e2; border: 2px solid #dc2626; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #991b1b; margin-top: 0;">🚨 Overdue Items (${overdueItems.length})</h3>
              <ul style="color: #7f1d1d; line-height: 1.8;">
                ${overdueItems.map((item: any) => `
                  <li>
                    <strong>${item.type === "isp" ? "ISP" : "Fire Evac"}</strong> - ${item.residentName} (${item.location})
                    <br>
                    <span style="font-size: 14px;">Due: ${new Date(item.dueDate).toLocaleDateString()}</span>
                  </li>
                `).join("")}
              </ul>
            </div>
          ` : ""}
          
          ${dueSoonItems.length > 0 ? `
            <div style="background: #fef3c7; border: 2px solid #f59e0b; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #92400e; margin-top: 0;">⏰ Due Soon (${dueSoonItems.length})</h3>
              <ul style="color: #78350f; line-height: 1.8;">
                ${dueSoonItems.map((item: any) => `
                  <li>
                    <strong>${item.type === "isp" ? "ISP" : "Fire Evac"}</strong> - ${item.residentName} (${item.location})
                    <br>
                    <span style="font-size: 14px;">Due: ${new Date(item.dueDate).toLocaleDateString()}</span>
                  </li>
                `).join("")}
              </ul>
            </div>
          ` : ""}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${baseUrl}/?view=compliance" 
               style="background: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">
              View Compliance Dashboard
            </a>
          </div>
          
          <div style="background: #e0e7ff; border: 1px solid #818cf8; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0; color: #3730a3; font-size: 14px;">
              <strong>📋 Action Required:</strong> Please review and update these compliance items as soon as possible.
            </p>
          </div>
          
          <p style="color: #555; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
            This reminder was sent by ${employee.name || employee.workEmail} from the compliance management system.
          </p>
        </div>
      </div>
    `;
    
    const results: any[] = [];
    
    for (const recipient of recipients) {
      if (!recipient.workEmail) continue; // Changed from recipient.email
      
      try {
        const fromEmail = process.env.FROM_EMAIL || "Compliance System <noreply@compliance.example.com>";
        const { data, error } = await resend.emails.send({
          from: fromEmail,
          to: recipient.workEmail, // Changed from recipient.email
          subject: `Compliance Reminder: ${overdueItems.length} Overdue, ${dueSoonItems.length} Due Soon`,
          html: emailHtml,
        });
        
        if (error) {
          console.error(`Failed to send to ${recipient.workEmail}:`, error); // Changed from recipient.email
          results.push({ email: recipient.workEmail, success: false, error }); // Changed from recipient.email
        } else {
          results.push({ email: recipient.workEmail, success: true, messageId: data?.id }); // Changed from recipient.email
        }
      } catch (error) {
        console.error(`Error sending to ${recipient.workEmail}:`, error); // Changed from recipient.email
        results.push({ email: recipient.workEmail, success: false, error }); // Changed from recipient.email
      }
    }
    
    return { sent: results.filter(r => r.success).length, total: recipients.length, results };
  },
});

// Send guardian checklist email (enhanced version)
export const sendGuardianChecklistEmail = internalAction({
  args: {
    linkId: v.id("guardian_checklist_links"),
    token: v.string(),
  },
  handler: async (ctx, { linkId, token }) => {
    const data = await ctx.runQuery(internal.guardianChecklists.internalGetChecklistLink, { linkId });
    if (!data) throw new Error("Link not found");
    
    const { link, template, resident } = data;
    // Use custom Resend API key if available, otherwise fall back to Convex proxy
    const apiKey = process.env.RESEND_API_KEY || process.env.CONVEX_RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("No Resend API key configured");
    }
    const resend = new Resend(apiKey);
    
    const baseUrl = process.env.SITE_URL || process.env.CONVEX_SITE_URL || "https://yourdomain.com";
    const checklistUrl = `${baseUrl}/?checklist=${token}`;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">📋 Guardian Checklist</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
          <h2 style="color: #333; margin-top: 0;">Hello,</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            You have been sent a checklist to complete for <strong>${resident?.name}</strong>.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <h3 style="color: #333; margin-top: 0;">Checklist Details:</h3>
            <p style="margin: 5px 0;"><strong>Template:</strong> ${template?.name}</p>
            <p style="margin: 5px 0;"><strong>Resident:</strong> ${resident?.name}</p>
            <p style="margin: 5px 0;"><strong>Questions:</strong> ${template?.questions?.length || 0}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${checklistUrl}" 
               style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">
              Complete Checklist
            </a>
          </div>
          
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              <strong>⏰ Important:</strong> This link will expire in 30 days. Please complete the checklist before then.
            </p>
          </div>
          
          <h3 style="color: #333;">What to Expect:</h3>
          <ol style="color: #555; line-height: 1.6;">
            <li>Click the button above to access the checklist</li>
            <li>Answer all required questions</li>
            <li>Submit your responses</li>
            <li>You'll receive a confirmation</li>
          </ol>
          
          <p style="color: #555; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
            If you have any questions about this checklist, please contact the care facility directly.
          </p>
          
          <p style="color: #888; font-size: 12px; margin-top: 20px;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${checklistUrl}" style="color: #2563eb; word-break: break-all;">${checklistUrl}</a>
          </p>
        </div>
      </div>
    `;
    
    const fromEmail = process.env.FROM_EMAIL || "Care Team <noreply@care-team.example.com>";
    const { data: emailData, error } = await resend.emails.send({
      from: fromEmail,
      to: link.guardianEmail,
      subject: `Guardian Checklist for ${resident?.name}`,
      html: emailHtml,
    });
    
    if (error) {
      throw new Error("Failed to send email: " + JSON.stringify(error));
    }
    
    return { success: true, messageId: emailData?.id };
  },
});

// Internal queries for email actions
import { internalQuery } from "./_generated/server";

export const getComplianceItemsForEmail = internalQuery({
  args: { itemIds: v.array(v.string()) },
  handler: async (ctx, { itemIds }) => {
    const allResidents = await ctx.db.query("residents").collect();
    const items = [];
    
    for (const itemId of itemIds) {
      // Parse itemId format: "isp-{residentId}" or "fire-evac-{residentId}"
      const [type, ...idParts] = itemId.split("-");
      const residentIdStr = idParts.join("-");
      
      const resident = allResidents.find(r => r._id === residentIdStr);
      if (!resident) continue;
      
      if (type === "isp") {
        const ispFiles = await ctx.db
          .query("isp_files")
          .withIndex("by_residentId", (q) => q.eq("residentId", resident._id))
          .collect();
        
        const activeISP = ispFiles.find(f => f.status === "active");
        if (activeISP) {
          const dueDate = activeISP.effectiveDate + (6 * 30 * 24 * 60 * 60 * 1000);
          const now = Date.now();
          const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
          
          let status = "ok";
          if (daysUntilDue < 0) status = "overdue";
          else if (daysUntilDue <= 30) status = "due-soon";
          
          items.push({
            id: itemId,
            type: "isp",
            residentName: resident.name,
            location: resident.location,
            dueDate,
            status,
          });
        }
      } else if (type === "fire") {
        const fireEvacPlans = await ctx.db
          .query("fire_evac")
          .withIndex("by_residentId", (q) => q.eq("residentId", resident._id))
          .order("desc")
          .take(1);
        
        const latestPlan = fireEvacPlans[0];
        if (latestPlan) {
          const dueDate = (latestPlan.createdAt || Date.now()) + (365 * 24 * 60 * 60 * 1000);
          const now = Date.now();
          const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
          
          let status = "ok";
          if (daysUntilDue < 0) status = "overdue";
          else if (daysUntilDue <= 30) status = "due-soon";
          
          items.push({
            id: itemId,
            type: "fire_evac",
            residentName: resident.name,
            location: resident.location,
            dueDate,
            status,
          });
        }
      }
    }
    
    return items;
  },
});

export const getUserForEmail = internalQuery({
  args: { clerkUserId: v.string() }, // Changed from userId: v.id("users")
  handler: async (ctx, { clerkUserId }) => { // Changed from userId
    return await ctx.db
      .query("employees") // Changed from users
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId)) // Changed index and field
      .unique();
  },
});

export const getComplianceRecipients = internalQuery({
  args: {},
  handler: async (ctx) => {
    const roles = await ctx.db.query("roles").collect();
    const adminAndSupervisorClerkUserIds = roles // Changed variable name
      .filter((r: any) => r.role === "admin" || r.role === "supervisor")
      .map((r: any) => r.clerkUserId); // Changed from userId
    
    const employees = []; // Changed from users
    for (const clerkUserId of adminAndSupervisorClerkUserIds) { // Changed from id of adminAndSupervisorIds
      const employee = await ctx.db
        .query("employees") // Changed from users
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId)) // Changed index and field
        .unique();
      if (employee) employees.push(employee);
    }
    
    return employees; // Changed from users
  },
});
