import {db} from '../index';
import {inspectorAccess, locations} from '../schema';
import {and, asc, eq} from 'drizzle-orm';
import {generateOtp, hashOtp} from '@/lib/inspector-auth';
import {logAudit} from '@/lib/db-helpers';

// Create an inspector-access grant. Returns the plaintext OTP exactly once —
// only its hash is stored, so it can never be recovered afterward.
export async function createInspectorAccess(args: {
	location: string;
	label?: string;
	expiresAt: Date;
	createdBy: string;
	createdByName?: string;
}) {
	const otp = generateOtp();

	const matches = await db
		.select({id: locations.id, name: locations.name})
		.from(locations)
		.where(and(eq(locations.name, args.location), eq(locations.status, 'active')))
		.orderBy(asc(locations.id))
		.limit(2);
	if (matches.length !== 1) {
		throw new Error('Location not found');
	}
	const location = matches[0]!;

	const [record] = await db
		.insert(inspectorAccess)
		.values({
			locationId: location.id,
			location: location.name,
			label: args.label,
			otpHash: hashOtp(otp),
			expiresAt: args.expiresAt,
			createdBy: args.createdBy,
			createdByName: args.createdByName,
			createdAt: new Date(),
		})
		.returning();

	if (!record) throw new Error('Failed to create inspector access');

	await logAudit({
		clerkUserId: args.createdBy,
		event: 'inspector_access.created',
		details: `Created inspector access ${record.id} for ${location.name}, expires ${args.expiresAt.toISOString()}`,
		deviceId: 'system',
		location: location.name,
	});

	return {record, otp};
}

export async function revokeInspectorAccess(id: string, revokedBy: string) {
	const existing = await db.query.inspectorAccess.findFirst({
		where: eq(inspectorAccess.id, id),
	});
	if (!existing) throw new Error('Inspector access not found');

	const currentLocation = existing.locationId
		? await db.query.locations.findFirst({
				where: eq(locations.id, existing.locationId),
			})
		: null;
	const locationName = currentLocation?.name || existing.location;

	const [updated] = await db
		.update(inspectorAccess)
		.set({revokedAt: new Date(), revokedBy})
		.where(eq(inspectorAccess.id, id))
		.returning();

	await logAudit({
		clerkUserId: revokedBy,
		event: 'inspector_access.revoked',
		details: `Revoked inspector access ${id} for ${locationName}`,
		deviceId: 'system',
		location: locationName,
	});

	return updated;
}

export async function touchInspectorAccess(id: string) {
	await db
		.update(inspectorAccess)
		.set({lastAccessedAt: new Date()})
		.where(eq(inspectorAccess.id, id));
}
