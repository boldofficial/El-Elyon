import {and, eq, isNull} from 'drizzle-orm';
import {db} from '@/db/index';
import {adminPrivileges} from '@/db/schema';
import {
	type AdminPrivilege,
	normalizeAdminPrivileges,
} from '@/lib/admin-privileges';
import {logAudit} from '@/lib/db-helpers';
import {getActiveAdminPrivileges} from '@/db/queries/admin-privileges';

export async function replaceAdminPrivileges(args: {
	targetClerkUserId: string;
	privileges: AdminPrivilege[];
	actorClerkUserId: string;
}) {
	const requestedPrivileges = normalizeAdminPrivileges(args.privileges);
	const existingPrivileges = await getActiveAdminPrivileges(args.targetClerkUserId);

	const toGrant = requestedPrivileges.filter(
		(privilege) => !existingPrivileges.includes(privilege)
	);
	const toRevoke = existingPrivileges.filter(
		(privilege) => !requestedPrivileges.includes(privilege)
	);

	for (const privilege of toRevoke) {
		await db
			.update(adminPrivileges)
			.set({
				revokedBy: args.actorClerkUserId,
				revokedAt: new Date(),
			})
			.where(
				and(
					eq(adminPrivileges.clerkUserId, args.targetClerkUserId),
					eq(adminPrivileges.privilege, privilege),
					isNull(adminPrivileges.revokedAt)
				)
			);
	}

	for (const privilege of toGrant) {
		await db.insert(adminPrivileges).values({
			clerkUserId: args.targetClerkUserId,
			privilege,
			grantedBy: args.actorClerkUserId,
			grantedAt: new Date(),
		});
	}

	if (toGrant.length > 0 || toRevoke.length > 0) {
		await logAudit({
			clerkUserId: args.actorClerkUserId,
			event: 'admin_privileges_updated',
			details: `target=${args.targetClerkUserId},granted=${toGrant.join('|')},revoked=${toRevoke.join('|')}`,
			deviceId: 'system',
			location: '',
		});
	}

	return {
		success: true,
		privileges: requestedPrivileges,
		granted: toGrant,
		revoked: toRevoke,
	};
}
