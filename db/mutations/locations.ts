// src/db/mutations/locations.ts

import {randomUUID} from 'node:crypto';
import {db} from '../index';
import {locationLegacyNames, locations} from '../schema';
import {eq} from 'drizzle-orm';

// ============================
// Location Management
// ============================

/**
 * Renames/updates a location, recording both its old and new name in
 * location_legacy_names so inspector reports can resolve either alias back
 * to this location.
 *
 * db.batch() (see db/index.ts for why - db.transaction() is unavailable on
 * this driver) sends every statement up front, before any of their results
 * come back, so a later statement in the same batch cannot be built from an
 * earlier one's return value. That would normally be a problem here: the
 * legacy-name insert needs the resident's old and new name. It isn't a
 * problem in practice, because both are knowable before the batch runs - the
 * old name from a plain pre-read, the new name by applying `data` to it
 * ourselves instead of waiting for the UPDATE to report it back.
 */
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
	const [current] = await db
		.select({name: locations.name})
		.from(locations)
		.where(eq(locations.id, locationId))
		.limit(1);
	if (!current) return undefined;

	const newName = data.name ?? current.name;

	const [[updated]] = await db.batch([
		db
			.update(locations)
			.set({
				...data,
				updatedAt: new Date(),
			})
			.where(eq(locations.id, locationId))
			.returning(),

		db
			.insert(locationLegacyNames)
			.values([
				{locationId, name: current.name, createdAt: new Date()},
				{locationId, name: newName, createdAt: new Date()},
			])
			.onConflictDoNothing(),
	]);

	return updated;
}

/**
 * Same db.batch() constraint as updateLocation: the legacy-name insert needs
 * the new location's id, which Postgres would normally generate. Generating
 * it here instead, and inserting it explicitly, means both statements in the
 * batch can be built up front without waiting on either one's result.
 */
export async function createLocation(data: {
	name: string;
	address?: string;
	phone?: string;
	capacity?: number;
	status?: string;
	createdBy: string;
}) {
	const id = randomUUID();

	const [[location]] = await db.batch([
		db
			.insert(locations)
			.values({
				id,
				...data,
				createdAt: new Date(),
			})
			.returning(),

		db
			.insert(locationLegacyNames)
			.values({
				locationId: id,
				name: data.name,
				createdAt: new Date(),
			})
			.onConflictDoNothing(),
	]);

	return location;
}

export async function deleteLocation(locationId: string) {
	await db.delete(locations).where(eq(locations.id, locationId));
}
