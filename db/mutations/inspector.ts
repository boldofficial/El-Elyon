import {db} from '../index';
import {inspectorAccess} from '../schema';
import {eq} from 'drizzle-orm';
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

	const [record] = await db
		.insert(inspectorAccess)
		.values({
			location: args.location,
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
		details: `Created inspector access ${record.id} for ${args.location}, expires ${args.expiresAt.toISOString()}`,
		deviceId: 'system',
		location: args.location,
	});

	return {record, otp};
}

export async function revokeInspectorAccess(id: string, revokedBy: string) {
	const existing = await db.query.inspectorAccess.findFirst({
		where: eq(inspectorAccess.id, id),
	});
	if (!existing) throw new Error('Inspector access not found');

	const [updated] = await db
		.update(inspectorAccess)
		.set({revokedAt: new Date(), revokedBy})
		.where(eq(inspectorAccess.id, id))
		.returning();

	await logAudit({
		clerkUserId: revokedBy,
		event: 'inspector_access.revoked',
		details: `Revoked inspector access ${id} for ${existing.location}`,
		deviceId: 'system',
		location: existing.location,
	});

	return updated;
}

export async function touchInspectorAccess(id: string) {
	await db
		.update(inspectorAccess)
		.set({lastAccessedAt: new Date()})
		.where(eq(inspectorAccess.id, id));
}
