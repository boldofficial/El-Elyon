// src/app/api/inspector/logout/route.ts
// Clears the inspector session cookie.

import {NextResponse} from 'next/server';
import {clearedSessionCookie} from '@/lib/inspector-auth';

export async function POST() {
	const res = NextResponse.json({success: true});
	res.headers.set('Set-Cookie', clearedSessionCookie());
	return res;
}
