import {Resend} from 'resend';
import {db} from '@/db/index';
import {
	employees,
	guardianChecklistLinks,
	guardianChecklistTemplates,
	residents,
} from '@/db/schema';
import {eq} from 'drizzle-orm';

// Initialize Resend outside the function for better performance in Vercel Edge Functions
// (though dynamic import is used in Convex, here we can initialize once)
const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail =
	process.env.FROM_EMAIL || 'El-Elyon Properties <noreply@yourdomain.com>';
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'; // Adjusted for Next.js default port

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
export async function sendWelcomeEmailWithCredentials(args: {
	employeeId: string;
	email: string;
	password: string;
}) {
	try {
		const employee = await getEmployeeDetails(args.employeeId);

		if (!employee) {
			console.error('❌ Employee not found for email:', args.employeeId);
			return {success: false, error: 'Employee not found'};
		}

		console.log('📧 Sending welcome email to:', args.email);

		// Validate environment variables
		if (!process.env.RESEND_API_KEY) {
			console.error('❌ RESEND_API_KEY not configured');
			return {success: false, error: 'Email service not configured'};
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

		const {data, error} = await resend.emails.send({
			from: fromEmail,
			to: args.email,
			subject: 'Welcome to El-Elyon Properties - Your Login Credentials',
			html: emailHtml,
		});

		if (error) {
			console.error('❌ Resend API error:', error);
			return {
				success: false,
				error: `Failed to send email: ${error.message || 'Unknown error'}`,
			};
		}

		console.log('✅ Welcome email sent successfully:', data?.id);
		return {success: true, emailId: data?.id};
	} catch (error) {
		console.error('❌ Exception while sending welcome email:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred',
		};
	}
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

/**
 * Send employee invite email
 * Called when admin generates an invite link for an employee
 */
export async function sendEmployeeInviteEmail(args: {
	email: string;
	name: string;
	inviteUrl: string;
	role: string;
	locations: string[];
}) {
	try {
		console.log('📧 Sending employee invite email to:', args.email);

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
            .header { background: #2563eb; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
            .button { display: inline-block; background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
            .info-box { background: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>You're Invited to El-Elyon Properties LLC</h1>
            </div>
            <div class="content">
              <h2>Hi ${args.name},</h2>
              <p>You have been invited to join the El-Elyon Properties care management system by your administrator.</p>
              
              <div class="info-box">
                <strong>Your Proposed Assignment:</strong><br>
                Role: ${args.role ? args.role.charAt(0).toUpperCase() + args.role.slice(1) : 'Not assigned yet'}<br>
                Locations: ${args.locations.join(', ') || 'Not assigned yet'}
              </div>

              <p>To accept your invitation and set up your account, please click the link below:</p>

              <div style="text-align: center;">
                <a href="${args.inviteUrl}" class="button">Accept Invitation</a>
              </div>

              <p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:<br>
              <a href="${args.inviteUrl}">${args.inviteUrl}</a></p>

              <p>This invitation link is valid for a limited time. Please accept it as soon as possible.</p>

              <p>If you have any questions or believe this email was sent to you by mistake, please contact your administrator.</p>

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
			to: args.email,
			subject: 'Invitation to El-Elyon Properties',
			html: emailHtml,
		});

		if (error) {
			console.error('❌ Resend API error:', error);
			return {
				success: false,
				error: `Failed to send invite email: ${error.message || 'Unknown error'}`,
			};
		}

		console.log('✅ Employee invite email sent successfully:', data?.id);
		return {success: true, emailId: data?.id};
	} catch (error) {
		console.error('❌ Exception while sending employee invite email:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred',
		};
	}
}

export async function sendGuardianChecklistEmail(
	linkId: string,
	token: string
) {
	try {
		const link = await db.query.guardianChecklistLinks.findFirst({
			where: eq(guardianChecklistLinks.id, linkId),
		});

		if (!link) {
			throw new Error('Link not found');
		}

		const template = await db.query.guardianChecklistTemplates.findFirst({
			where: eq(guardianChecklistTemplates.id, link.templateId),
		});

		const resident = await db.query.residents.findFirst({
			where: eq(residents.id, link.residentId),
		});

		if (!template || !resident) {
			throw new Error('Template or resident not found');
		}

		const checklistUrl = `${baseUrl}/?checklist=${token}`;

		const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">📋 Guardian Checklist</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
          <h2 style="color: #333; margin-top: 0;">Hello,</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            You have been sent a checklist to complete for <strong>${resident.name}</strong>.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <h3 style="color: #333; margin-top: 0;">Checklist Details:</h3>
            <p style="margin: 5px 0;"><strong>Template:</strong> ${template.name}</p>
            <p style="margin: 5px 0;"><strong>Resident:</strong> ${resident.name}</p>
            <p style="margin: 5px 0;"><strong>Questions:</strong> ${template.questions?.length || 0}</p>
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

		const {data, error} = await resend.emails.send({
			from: fromEmail,
			to: link.guardianEmail,
			subject: `Guardian Checklist for ${resident.name}`,
			html: emailHtml,
		});

		if (error) {
			throw new Error(`Failed to send email: ${JSON.stringify(error)}`);
		}

		return {success: true, messageId: data?.id};
	} catch (error: any) {
		console.error('Error sending guardian checklist email:', error);
		throw error;
	}
}
