"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import * as nodemailer from "nodemailer";

// --- SEND INVITE EMAIL VIA SMTP ACTION (internal) ---
export const sendInviteEmailSMTP = internalAction({
  args: {
    employeeId: v.id("employees"),
    inviteToken: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; messageId?: string }> => {
    // Get employee details
    const employee: any = await ctx.runQuery(internal.employees.getEmployeeForEmail, {
      employeeId: args.employeeId,
    });
    
    if (!employee || !employee.email) {
      console.error("Employee data:", employee);
      throw new Error("Employee not found or email missing");
    }
    
    console.log("Sending invite email to:", employee.email);

    // Create SMTP transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, // e.g., "mail.yourdomain.com"
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER, // your email
        pass: process.env.SMTP_PASS, // your password
      },
    });
    
    // Build invite URL
    const baseUrl = process.env.SITE_URL || 'https://yourdomain.com';
    const inviteUrl = `${baseUrl}/?invite=${args.inviteToken}`;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Our Care Team!</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
          <h2 style="color: #333; margin-top: 0;">Hi ${employee.name},</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            You've been invited to join our care management system as a <strong>${employee.role}</strong>. 
            This platform will help you manage resident care, document activities, and collaborate with your team.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
            <h3 style="color: #333; margin-top: 0;">Your Role & Locations:</h3>
            <p style="margin: 5px 0;"><strong>Role:</strong> ${employee.role.charAt(0).toUpperCase() + employee.role.slice(1)}</p>
            <p style="margin: 5px 0;"><strong>Assigned Locations:</strong> ${employee.locations.length > 0 ? employee.locations.join(', ') : 'None assigned yet'}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" 
               style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">
              Accept Invitation & Set Password
            </a>
          </div>
          
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              <strong>⏰ Important:</strong> This invitation expires in 24 hours. Please accept it soon to get started.
            </p>
          </div>
          
          <h3 style="color: #333;">What's Next?</h3>
          <ol style="color: #555; line-height: 1.6;">
            <li>Click the invitation link above</li>
            <li>Create your secure password</li>
            <li>Complete your profile setup</li>
            <li>Start managing resident care</li>
          </ol>
          
          <p style="color: #555; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
            If you have any questions or need help getting started, please contact your supervisor or system administrator.
          </p>
          
          <p style="color: #888; font-size: 12px; margin-top: 20px;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${inviteUrl}" style="color: #667eea; word-break: break-all;">${inviteUrl}</a>
          </p>
        </div>
      </div>
    `;

    try {
      const info: any = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'Care Team'}" <${process.env.FROM_EMAIL || 'noreply@yourdomain.com'}>`,
        to: employee.email,
        subject: `Welcome to the Care Team - Complete Your Setup`,
        html: emailHtml,
      });

      console.log('Invite email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending invite email:', error);
      throw new Error('Failed to send invite email via SMTP');
    }
  },
});
