// src/db/mutations/locations.ts

import {db} from '../index';
import {locations} from '../schema';
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
	const [updated] = await db
		.update(locations)
		.set({
			...data,
			updatedAt: new Date(),
		})
		.where(eq(locations.id, locationId))
		.returning();

	return updated;
}

export async function createLocation(data: {
	name: string;
	address?: string;
	phone?: string;
	capacity?: number;
	status?: string;
	createdBy: string;
}) {
	const [location] = await db
		.insert(locations)
		.values({
			...data,
			createdAt: new Date(),
		})
		.returning();

	return location;
}

export async function deleteLocation(locationId: string) {
	await db.delete(locations).where(eq(locations.id, locationId));
}
