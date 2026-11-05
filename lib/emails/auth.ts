import {Resend} from 'resend';
import {db} from '@/db/index';
import {employees} from '@/db/schema'; // This might not be needed in auth.ts if getEmployeeDetails is not used directly.
import {eq} from 'drizzle-orm';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail =
	process.env.FROM_EMAIL || 'El-Elyon Properties <noreply@yourdomain.com>';

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
