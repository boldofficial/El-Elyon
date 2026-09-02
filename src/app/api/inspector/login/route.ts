// src/app/api/inspector/login/route.ts
//
// Exchanges a one-time password for a read-only inspector session cookie.
// The OTP is reusable within its validity window (multiple devices allowed);
// access dies when the grant expires or an admin revokes it.

import {NextResponse} from 'next/server';
import {findActiveInspectorAccessByOtp} from '@/db/queries/inspector';
import {touchInspectorAccess} from '@/db/mutations/inspector';
import {sessionCookie} from '@/lib/inspector-auth';
import {logAudit} from '@/lib/db-helpers';

export async function POST(req: Request) {
	try {
		const {otp} = await req.json();
		if (!otp || typeof otp !== 'string') {
			return NextResponse.json({error: 'Access code required'}, {status: 400});
		}

		const access = await findActiveInspectorAccessByOtp(otp.trim());
		if (!access) {
			return NextResponse.json(
				{error: 'Invalid or expired access code'},
				{status: 401}
			);
		}

		await touchInspectorAccess(access.id);
		await logAudit({
			clerkUserId: null,
			event: 'inspector.login',
			details: `Inspector session started for access ${access.id}`,
			deviceId: 'inspector',
			location: access.location,
		});

		const res = NextResponse.json({
			location: access.location,
			label: access.label,
			expiresAt: access.expiresAt,
		});
		res.headers.set('Set-Cookie', sessionCookie(access.id, access.expiresAt));
		return res;
	} catch (error: any) {
		console.error('Inspector login error:', error);
		return NextResponse.json({error: 'Login failed'}, {status: 500});
	}
}
