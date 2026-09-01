// src/db/mutations/locations.ts

import {db} from '../index';
import {locationLegacyNames, locations} from '../schema';
import {eq} from 'drizzle-orm';

// ============================
// Location Management
// ============================

export async function updateLocation(
	locationId: string,
	data: {
		name?: string;
		address?: string;
		phone?: string;
		capacity?: number;
		status?: string;
	}
) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({name: locations.name})
			.from(locations)
			.where(eq(locations.id, locationId))
			.limit(1);
		if (!current) return undefined;

		const [updated] = await tx
			.update(locations)
			.set({
				...data,
				updatedAt: new Date(),
			})
			.where(eq(locations.id, locationId))
			.returning();

		if (!updated) return undefined;

		await tx
			.insert(locationLegacyNames)
			.values([
				{locationId, name: current.name, createdAt: new Date()},
				{locationId, name: updated.name, createdAt: new Date()},
			])
			.onConflictDoNothing();

		return updated;
	});
}

export async function createLocation(data: {
	name: string;
	address?: string;
	phone?: string;
	capacity?: number;
	status?: string;
	createdBy: string;
}) {
	return db.transaction(async (tx) => {
		const [location] = await tx
			.insert(locations)
			.values({
				...data,
				createdAt: new Date(),
			})
			.returning();

		if (!location) return undefined;

		await tx
			.insert(locationLegacyNames)
			.values({
				locationId: location.id,
				name: location.name,
				createdAt: new Date(),
			})
			.onConflictDoNothing();

		return location;
	});
}

export async function deleteLocation(locationId: string) {
	await db.delete(locations).where(eq(locations.id, locationId));
}
