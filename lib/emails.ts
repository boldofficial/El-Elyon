import { Resend } from 'resend';
import { db } from '@/db/index';
import { employees } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Initialize Resend outside the function for better performance in Vercel Edge Functions
// (though dynamic import is used in Convex, here we can initialize once)
const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.FROM_EMAIL || 'El-Elyon Properties <noreply@yourdomain.com>';
const baseUrl = process.env.SITE_URL || 'http://localhost:3000'; // Adjusted for Next.js default port

/**
 * Helper to get employee details by ID
 */
async function getEmployeeDetails(employeeId: string) {
    return await db.query.employees.findFirst({
        where: eq(employees.id, employeeId),
    });
}

/**
 * Send welcome email with login credentials
 * Called when admin creates employee account
 */
export async function sendWelcomeEmailWithCredentials(args: { employeeId: string; email: string; password: string }) {
    try {
        const employee = await getEmployeeDetails(args.employeeId);

        if (!employee) {
            console.error('❌ Employee not found for email:', args.employeeId);
            return { success: false, error: 'Employee not found' };
        }

        console.log('📧 Sending welcome email to:', args.email);

        // Validate environment variables
        if (!process.env.RESEND_API_KEY) {
            console.error('❌ RESEND_API_KEY not configured');
            return { success: false, error: 'Email service not configured' };
        }

        const loginUrl = `${baseUrl}/`;

        const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
            .credentials-box { background: #fff; border: 2px solid #2563eb; border-radius: 6px; padding: 20px; margin: 20px 0; }
            .button { display: inline-block; background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
            .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
            .info-box { background: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to El-Elyon Properties LLC</h1>
            </div>
            <div class="content">
              <h2>Hi ${employee.name},</h2>
              <p>Your administrator has created an account for you to access the El-Elyon Properties care management system.</p>
              
              <div class="info-box">
                <strong>Your Assignment:</strong><br>
                Role: ${employee.role ? employee.role.charAt(0).toUpperCase() + employee.role.slice(1) : 'Not assigned yet'}<br>
                Locations: ${employee.locations.join(', ') || 'Not assigned yet'}
              </div>

              <div class="credentials-box">
                <h3 style="margin-top: 0; color: #2563eb;">Your Login Credentials</h3>
                <p style="margin: 10px 0;"><strong>Email:</strong> ${args.email}</p>
                <p style="margin: 10px 0;"><strong>Temporary Password:</strong> <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 16px;">${args.password}</code></p>
              </div>

              <div class="warning-box">
                <strong>⚠️ Important Security Steps:</strong>
                <ol style="margin: 10px 0; padding-left: 20px;">
                  <li>Use these credentials to login for the first time</li>
                  <li><strong>Change your password immediately</strong> after logging in</li>
                  <li>Never share your password with anyone</li>
                  <li>Delete this email after changing your password</li>
                </ol>
              </div>

              <div style="text-align: center;">
                <a href="${loginUrl}" class="button">Login to Your Account</a>
              </div>

              <p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:<br>
              <a href="${loginUrl}">${loginUrl}</a></p>

              <p><strong>After logging in, you'll be able to:</strong></p>
              <ul>
                <li>Clock in and out of shifts</li>
                <li>Log resident care activities</li>
                <li>Access resident information</li>
                <li>View compliance documents</li>
              </ul>

              <p>If you have any questions or need assistance, please contact your supervisor.</p>

              <p>Welcome to the team!<br>
              <strong>El-Elyon Properties Team</strong></p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} El-Elyon Properties LLC. All rights reserved.</p>
              <p style="font-size: 12px;">Powered by Bold Ideas Innovations Ltd</p>
              <p style="font-size: 11px; color: #9ca3af; margin-top: 10px;">
                This email contains sensitive information. Please keep it secure and delete after use.
              </p>
            </div>
          </div>
        </body>
    </html>
        `;

        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: args.email,
            subject: 'Welcome to El-Elyon Properties - Your Login Credentials',
            html: emailHtml,
        });

        if (error) {
            console.error('❌ Resend API error:', error);
            return { success: false, error: `Failed to send email: ${error.message || 'Unknown error'}` };
        }

        console.log('✅ Welcome email sent successfully:', data?.id);
        return { success: true, emailId: data?.id };
    } catch (error) {
        console.error('❌ Exception while sending welcome email:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
}

/**
 * Send password change confirmation email
 * Optional - can be used to confirm password changes
 */
export async function sendPasswordChangeConfirmation(args: { employeeId: string; email: string }) {
    try {
        const employee = await getEmployeeDetails(args.employeeId);

        if (!employee) {
            console.error('❌ Employee not found for email:', args.employeeId);
            return { success: false, error: 'Employee not found' };
        }

        console.log('📧 Sending password change confirmation to:', args.email);

        if (!process.env.RESEND_API_KEY) {
            console.error('❌ RESEND_API_KEY not configured');
            return { success: false, error: 'Email service not configured' };
        }

        const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10b981; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
            .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
            .success-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Password Changed Successfully</h1>
            </div>
            <div class="content">
              <h2>Hi ${employee.name},</h2>
              
              <div class="success-box">
                <p style="margin: 0;"><strong>Your password has been changed successfully.</strong></p>
                <p style="margin: 10px 0 0 0; font-size: 14px;">Time: ${new Date().toLocaleString()}</p>
              </div>

              <p>Your account is now secured with your new password. You can use it to login to the system.</p>

              <p><strong>If you did not make this change:</strong></p>
              <ul>
                <li>Contact your administrator immediately</li>
                <li>Your account may have been compromised</li>
              </ul>

              <p>Best regards,<br>
              <strong>El-Elyon Properties Team</strong></p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} El-Elyon Properties LLC. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
        `;

        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: args.email,
            subject: 'Password Changed - El-Elyon Properties',
            html: emailHtml,
        });

        if (error) {
            console.error('❌ Resend API error:', error);
            return { success: false, error: `Failed to send password change confirmation: ${error.message || 'Unknown error'}` };
        }

        console.log('✅ Password change confirmation sent successfully:', data?.id);
        return { success: true, emailId: data?.id };
    } catch (error) {
        console.error('❌ Exception while sending password change confirmation:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
}

// Placeholder for invite email - to be implemented if needed
export async function sendInviteEmail(args: { employeeId: string; inviteToken: string }) {
    console.log('Placeholder: Sending invite email for employee', args.employeeId, 'with token', args.inviteToken);
    // In a real implementation, you would use a service like Resend or Nodemailer here.
    return { success: true };
}
