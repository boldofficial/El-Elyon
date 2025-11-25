// src/db/queries/kiosks.ts

import {db} from '../index';
import {kiosks, kioskPairingTokens} from '../schema';
import {eq, and} from 'drizzle-orm';
import {getUserRoleDoc} from '@/lib/db-helpers';

// Helper: Check admin access for queries (no audit logging in queries)
async function requireAdminQuery(clerkUserId: string) {
	const userRole = await getUserRoleDoc(clerkUserId);
	if (!userRole || userRole.role !== 'admin') {
		throw new Error('Admin access required');
	}
	return userRole;
}

// Query: List all kiosks (admin only)
export async function listKiosks(clerkUserId: string) {
	await requireAdminQuery(clerkUserId);

	const kiosksList = await db.query.kiosks.findMany({
		orderBy: (kiosks, {desc}) => [desc(kiosks.createdAt)],
	});

	return kiosksList.map((kiosk) => ({
		id: kiosk.id,
		deviceId: kiosk.deviceId,
		deviceLabel: kiosk.deviceLabel,
		name: kiosk.name,
		location: kiosk.location,
		status: kiosk.status ?? 'active',
		active: kiosk.active ?? true,
		registeredAt: kiosk.registeredAt,
		lastSeenAt: kiosk.lastSeenAt,
		lastHeartbeat: kiosk.lastHeartbeat,
		createdAt: kiosk.createdAt,
	}));
}

// Query: List active pairing tokens (admin only)
export async function listPairingTokens(clerkUserId: string) {
	await requireAdminQuery(clerkUserId);

	const tokens = await db.query.kioskPairingTokens.findMany({
		where: eq(kioskPairingTokens.status, 'active'),
		orderBy: (kioskPairingTokens, {desc}) => [
			desc(kioskPairingTokens.issuedAt),
		],
	});

	return tokens.map((token) => ({
		id: token.id,
		token: token.token,
		deviceId: token.deviceId,
		location: token.location,
		deviceLabel: token.deviceLabel,
		expiresAt: token.expiresAt,
		issuedAt: token.issuedAt,
		status: token.status,
		issuedBy: token.issuedBy,
	}));
}

// Query: Get kiosk by device ID (public - used by kiosk devices)
export async function getKioskByDeviceId(deviceId: string) {
	const kiosk = await db.query.kiosks.findFirst({
		where: eq(kiosks.deviceId, deviceId),
	});

	if (!kiosk) return null;

	return {
		id: kiosk.id,
		deviceId: kiosk.deviceId,
		deviceLabel: kiosk.deviceLabel,
		location: kiosk.location,
		status: kiosk.status ?? 'active',
		registeredAt: kiosk.registeredAt,
		lastSeenAt: kiosk.lastSeenAt,
		isActive: kiosk.active ?? true,
	};
}

// Query: Get pairing token details (public - for pairing process)
export async function getPairingTokenByToken(token: string) {
	const pairing = await db.query.kioskPairingTokens.findFirst({
		where: eq(kioskPairingTokens.token, token),
	});

	return pairing;
}

// Query: List available kiosk devices for employee assignment (admin only)
export async function listAvailableKioskDevices(clerkUserId: string) {
	await requireAdminQuery(clerkUserId);

	const activeKiosks = await db.query.kiosks.findMany({
		where: and(eq(kiosks.status, 'active'), eq(kiosks.active, true)),
		orderBy: (kiosks, {asc}) => [asc(kiosks.location)],
	});

	return activeKiosks.map((kiosk) => ({
		deviceId: kiosk.deviceId,
		deviceLabel: kiosk.deviceLabel || kiosk.name || kiosk.deviceId,
		location: kiosk.location,
	}));
}

// Query: Get kiosk by ID (admin only)
export async function getKioskById(kioskId: string, clerkUserId: string) {
	await requireAdminQuery(clerkUserId);

	const kiosk = await db.query.kiosks.findFirst({
		where: eq(kiosks.id, kioskId),
	});

	return kiosk;
}
