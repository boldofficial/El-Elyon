// src/app/api/admin/inspector-access/route.ts
// Admin: list and generate inspector-access grants.

import {auth, clerkClient} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {requireAdminAccess} from '@/lib/db-helpers';
import {listInspectorAccess} from '@/db/queries/inspector';
import {createInspectorAccess} from '@/db/mutations/inspector';

export async function GET() {
	const {userId} = await auth();
	if (!userId) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

	try {
		await requireAdminAccess(userId);
		const grants = await listInspectorAccess();
		// Never expose otpHash to the client.
		const now = Date.now();
		const sanitized = grants.map(({otpHash, ...g}) => ({
			...g,
			status: g.revokedAt
				? 'revoked'
				: g.expiresAt.getTime() <= now
				? 'expired'
				: 'active',
		}));
		return NextResponse.json(sanitized);
	} catch (error: any) {
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

export async function POST(req: Request) {
	const {userId} = await auth();
	if (!userId) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

	try {
		await requireAdminAccess(userId);

		const {location, label, expiresInHours} = await req.json();
		if (!location) {
			return NextResponse.json({error: 'Location is required'}, {status: 400});
		}

		const hours = Number(expiresInHours);
		if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) {
			return NextResponse.json(
				{error: 'expiresInHours must be between 1 and 720'},
				{status: 400}
			);
		}

		const clerkUser = await (await clerkClient()).users.getUser(userId);
		const createdByName =
			[clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
			clerkUser.username ||
			undefined;

		const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

		const {record, otp} = await createInspectorAccess({
			location,
			label: label || undefined,
			expiresAt,
			createdBy: userId,
			createdByName,
		});

		// otp is returned exactly once for the admin to hand to the inspector.
		return NextResponse.json({
			id: record.id,
			locationId: record.locationId,
			location: record.location,
			label: record.label,
			expiresAt: record.expiresAt,
			otp,
		});
	} catch (error: any) {
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
