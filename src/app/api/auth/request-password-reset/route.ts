import { NextResponse } from 'next/server';
import { logAudit } from '@/db-helpers';
import { updateUser } from '@/db/mutations/users';
import { getUserByEmail } from '@/db/queries/users';
import { sendPasswordResetEmail } from '@/emails';
import { generateToken } from '@/utils';
export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const user = await getUserByEmail(email); // Assuming getUserByEmail exists in db/queries/users.ts or db/mutations/users.ts
    if (!user) {
      // For security, always return a generic success message even if user not found
      // to prevent email enumeration.
      console.warn(`Password reset requested for non-existent email: ${email}`);
      await logAudit({
        clerkUserId: 'system', // Or a more appropriate system user ID
        event: 'Password Reset Request (Non-existent User)',
        details: `Attempted password reset for email: ${email}`,
        deviceId: 'server',
        location: 'auth-api',
      });
      return NextResponse.json({ message: 'If an account with that email exists, a reset link has been sent.' }, { status: 200 });
    }

    const resetToken = generateToken(); // Generate a token
    const resetTokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour from now

    await updateUser(user.id, { resetToken, resetTokenExpiry, updatedAt: new Date() }); // Store token and expiry

    await sendPasswordResetEmail(email, resetToken); // Send email with token

    await logAudit({
      clerkUserId: user.clerkUserId,
      event: 'Password Reset Request',
      details: `Password reset link sent to ${email}`,
      deviceId: 'server',
      location: 'auth-api',
    });

    return NextResponse.json({ message: 'If an account with that email exists, a reset link has been sent.' }, { status: 200 });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    return NextResponse.json({ error: 'Failed to process password reset request.' }, { status: 500 });
  }
}
