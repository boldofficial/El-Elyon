// lib/inspector-auth.ts
//
// Auth helpers for the state-inspector dashboard. Inspectors do not have Clerk
// accounts; an admin generates a one-time password (OTP) scoped to a location
// with an expiry, and the inspector exchanges it for a signed, httpOnly session
// cookie. All inspector data access is read-only and validated against a live,
// non-revoked, non-expired inspector_access row.

import crypto from 'crypto';
import {db} from '@/db/index';
import {inspectorAccess} from '@/db/schema';
import {eq} from 'drizzle-orm';

export const INSPECTOR_COOKIE = 'inspector_session';

// Cookie/OTP signing secret. A dedicated env var is preferred; fall back to
// CRON_SECRET so the feature works without additional configuration.
function secret(): string {
	const s = process.env.INSPECTOR_SESSION_SECRET || process.env.CRON_SECRET;
	if (!s) {
		throw new Error(
			'INSPECTOR_SESSION_SECRET (or CRON_SECRET) must be set for inspector access'
		);
	}
	return s;
}

// OTP: 10 chars from an unambiguous alphabet (no 0/O/1/I/L), grouped as XXXXX-XXXXX.
const OTP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateOtp(): string {
	const bytes = crypto.randomBytes(10);
	let out = '';
	for (let i = 0; i < 10; i++) {
		out += OTP_ALPHABET[bytes[i] % OTP_ALPHABET.length];
		if (i === 4) out += '-';
	}
	return out;
}

// Normalize user input (case-insensitive, ignore spaces/dashes) before hashing.
function normalizeOtp(otp: string): string {
	return otp.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashOtp(otp: string): string {
	return crypto
		.createHmac('sha256', secret())
		.update(`otp:${normalizeOtp(otp)}`)
		.digest('hex');
}

// Signed session token: "<accessId>.<hmac>".
export function signSession(accessId: string): string {
	const sig = crypto
		.createHmac('sha256', secret())
		.update(`sess:${accessId}`)
		.digest('hex');
	return `${accessId}.${sig}`;
}

function verifySignature(token: string): string | null {
	const dot = token.lastIndexOf('.');
	if (dot < 0) return null;
	const accessId = token.slice(0, dot);
	const sig = token.slice(dot + 1);
	const expected = crypto
		.createHmac('sha256', secret())
		.update(`sess:${accessId}`)
		.digest('hex');
	// Constant-time comparison.
	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
	return accessId;
}

export interface InspectorSession {
	accessId: string;
	location: string;
	label: string | null;
	expiresAt: Date;
}

// Validate the request's inspector cookie and return the live session, or null.
export async function getInspectorSession(
	req: Request
): Promise<InspectorSession | null> {
	const cookie = req.headers
		.get('cookie')
		?.split(';')
		.map((c) => c.trim())
		.find((c) => c.startsWith(`${INSPECTOR_COOKIE}=`));
	if (!cookie) return null;

	const token = decodeURIComponent(cookie.slice(INSPECTOR_COOKIE.length + 1));
	const accessId = verifySignature(token);
	if (!accessId) return null;

	const access = await db.query.inspectorAccess.findFirst({
		where: eq(inspectorAccess.id, accessId),
	});
	if (!access) return null;
	if (access.revokedAt) return null;
	if (access.expiresAt.getTime() <= Date.now()) return null;

	return {
		accessId: access.id,
		location: access.location,
		label: access.label,
		expiresAt: access.expiresAt,
	};
}

// Serialized Set-Cookie value for an inspector session.
export function sessionCookie(accessId: string, expiresAt: Date): string {
	const value = encodeURIComponent(signSession(accessId));
	const maxAge = Math.max(
		0,
		Math.floor((expiresAt.getTime() - Date.now()) / 1000)
	);
	const secureFlag = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
	return `${INSPECTOR_COOKIE}=${value}; Path=/; HttpOnly;${secureFlag} SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearedSessionCookie(): string {
	const secureFlag = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
	return `${INSPECTOR_COOKIE}=; Path=/; HttpOnly;${secureFlag} SameSite=Lax; Max-Age=0`;
}
