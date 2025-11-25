import {NextResponse} from 'next/server';
import {logAudit} from '@/db-helpers';
import {getUserByEmail} from '@/db/queries/users';

export async function POST(request: Request) {
	try {
		const {email, token} = await request.json();

		if (!email || !token) {
			return NextResponse.json(
				{error: 'Email and token are required'},
				{status: 400}
			);
		}

		const user = await getUserByEmail(email);
		if (!user) {
			await logAudit({
				clerkUserId: 'system',
				event: 'Password Reset Token Verification (Non-existent User)',
				details: `Attempted token verification for email: ${email}`,
				deviceId: 'server',
				location: 'auth-api',
			});
			return NextResponse.json(
				{valid: false, message: 'Invalid reset link'},
				{status: 200}
			);
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
				event: 'Password Reset Token Verification (Invalid/Expired)',
				details: `Invalid or expired token for email: ${email}`,
				deviceId: 'server',
				location: 'auth-api',
			});
			return NextResponse.json(
				{valid: false, message: 'Invalid or expired reset link'},
				{status: 200}
			);
		}

		await logAudit({
			clerkUserId: user.clerkUserId,
			event: 'Password Reset Token Verification (Success)',
			details: `Token successfully verified for email: ${email}`,
			deviceId: 'server',
			location: 'auth-api',
		});

		return NextResponse.json(
			{valid: true, userName: user.name || user.email},
			{status: 200}
		);
	} catch (error) {
		console.error('Error verifying password reset token:', error);
		return NextResponse.json(
			{error: 'Failed to verify reset token.'},
			{status: 500}
		);
	}
}
