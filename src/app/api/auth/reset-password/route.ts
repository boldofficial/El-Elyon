import {NextResponse} from 'next/server';
import {getUserByEmail} from '@/db/queries/users';
import {logAudit} from '@/db-helpers';
import {updateUser} from '@/db/mutations/users';
import {hashPassword} from '@/utils';

export async function POST(request: Request) {
	try {
		const {email, token, newPassword} = await request.json();

		if (!email || !token || !newPassword) {
			return NextResponse.json(
				{error: 'Email, token, and new password are required'},
				{status: 400}
			);
		}

		if (newPassword.length < 8) {
			return NextResponse.json(
				{error: 'Password must be at least 8 characters'},
				{status: 400}
			);
		}

		const user = await getUserByEmail(email);
		if (!user) {
			await logAudit({
				clerkUserId: 'system',
				event: 'Password Reset (Non-existent User)',
				details: `Attempted password reset for non-existent email: ${email}`,
				deviceId: 'server',
				location: 'auth-api',
			});
			return NextResponse.json({error: 'Invalid reset link'}, {status: 400});
		}

		// Check if token matches and is not expired
		const now = new Date();
		if (
			user.resetToken !== token ||
			!user.resetTokenExpiry ||
			user.resetTokenExpiry < now
		) {
			await logAudit({
				clerkUserId: user.clerkUserId,
				event: 'Password Reset (Invalid/Expired Token)',
				details: `Invalid or expired token for email: ${email}`,
				deviceId: 'server',
				location: 'auth-api',
			});
			return NextResponse.json(
				{error: 'Invalid or expired reset link'},
				{status: 400}
			);
		}

		// Hash the new password
		const hashedPassword = await hashPassword(newPassword); // Assuming hashPassword function

		// Update user's password and clear reset token fields
		await updateUser(user.id, {
			passwordHash: hashedPassword,
			resetToken: null,
			resetTokenExpiry: null,
			updatedAt: new Date(),
		});

		await logAudit({
			clerkUserId: user.clerkUserId,
			event: 'Password Reset (Success)',
			details: `Password successfully reset for email: ${email}`,
			deviceId: 'server',
			location: 'auth-api',
		});

		return NextResponse.json(
			{message: 'Password reset successfully'},
			{status: 200}
		);
	} catch (error) {
		console.error('Error resetting password:', error);
		return NextResponse.json(
			{error: 'Failed to reset password.'},
			{status: 500}
		);
	}
}
