import {Resend} from 'resend';
import {db} from '@/db/index';
import {employees} from '@/db/schema'; // This might not be needed in auth.ts if getEmployeeDetails is not used directly.
import {eq} from 'drizzle-orm';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail =
	process.env.FROM_EMAIL || 'El-Elyon Properties <noreply@yourdomain.com>';
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';

/**
 * Helper to get employee details by ID
 * This helper is also used by sendPasswordChangeConfirmation. If other auth emails
 * don't need it, we might consider moving it to a shared `email-helpers.ts` or
 * duplicating it if it's tightly coupled to employee data in sendPasswordChangeConfirmation.
 * For now, keeping it here as it's directly used by one of the functions being moved.
 */
async function getEmployeeDetails(employeeId: string) {
	return await db.query.employees.findFirst({
		where: eq(employees.id, employeeId),
	});
}

/**
 * Send password reset email
 * Called when a user requests to reset their password
 */
export async function sendPasswordResetEmail(email: string, token: string) {
	try {
		console.log('📧 Sending password reset email to:', email);

		if (!process.env.RESEND_API_KEY) {
			console.error('❌ RESEND_API_KEY not configured');
			return {success: false, error: 'Email service not configured'};
		}

		const resetUrl = `${baseUrl}/reset-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(token)}`;

		const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #f59e0b; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
            .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
            .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <h2>Hello,</h2>
              <p>You have requested to reset your password for your El-Elyon Properties LLC account.</p>
              
              <div class="warning-box">
                <p style="margin: 0;">If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
              </div>

              <p>To reset your password, please click the link below:</p>

              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Your Password</a>
              </div>

              <p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:<br>
              <a href="${resetUrl}">${resetUrl}</a></p>

              <p>This link will expire in 1 hour for security reasons.</p>

              <p>If you have any questions or need further assistance, please contact your administrator.</p>

              <p>Best regards,<br>
              <strong>El-Elyon Properties Team</strong></p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} El-Elyon Properties LLC. All rights reserved.</p>
              <p style="font-size: 12px;">Powered by Bold Ideas Innovations Ltd</p>
            </div>
          </div>
        </body>
        </html>
        `;

		const {data, error} = await resend.emails.send({
			from: fromEmail,
			to: email,
			subject: 'Password Reset Request for El-Elyon Properties',
			html: emailHtml,
		});

		if (error) {
			console.error('❌ Resend API error:', error);
			return {
				success: false,
				error: `Failed to send password reset email: ${error.message || 'Unknown error'}`,
			};
		}

		console.log('✅ Password reset email sent successfully:', data?.id);
		return {success: true, emailId: data?.id};
	} catch (error) {
		console.error('❌ Exception while sending password reset email:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred',
		};
	}
}

/**
 * Send password change confirmation email
 * Optional - can be used to confirm password changes
 */
export async function sendPasswordChangeConfirmation(args: {
	employeeId: string;
	email: string;
}) {
	try {
		const employee = await getEmployeeDetails(args.employeeId);

		if (!employee) {
			console.error('❌ Employee not found for email:', args.employeeId);
			return {success: false, error: 'Employee not found'};
		}

		console.log('📧 Sending password change confirmation to:', args.email);

		if (!process.env.RESEND_API_KEY) {
			console.error('❌ RESEND_API_KEY not configured');
			return {success: false, error: 'Email service not configured'};
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

		const {data, error} = await resend.emails.send({
			from: fromEmail,
			to: args.email,
			subject: 'Password Changed - El-Elyon Properties',
			html: emailHtml,
		});

		if (error) {
			console.error('❌ Resend API error:', error);
			return {
				success: false,
				error: `Failed to send password change confirmation: ${error.message || 'Unknown error'}`,
			};
		}

		console.log('✅ Password change confirmation sent successfully:', data?.id);
		return {success: true, emailId: data?.id};
	} catch (error) {
		console.error(
			'❌ Exception while sending password change confirmation:',
			error
		);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred',
		};
	}
}
