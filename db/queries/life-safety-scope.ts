export type NamedLocation = {id: string; name: string};

export function matchUniqueAssignedLocations<T extends NamedLocation>(
	assignedNames: readonly string[],
	activeLocations: readonly T[]
): T[] | null {
	const normalized = assignedNames.map((name) => name.trim()).filter(Boolean);
	if (normalized.length !== assignedNames.length) return null;
	if (new Set(normalized).size !== normalized.length) return null;

	const byName = new Map<string, T[]>();
	for (const location of activeLocations) {
		const bucket = byName.get(location.name);
		if (bucket) bucket.push(location);
		else byName.set(location.name, [location]);
	}

	if (byName.size !== normalized.length) return null;
	for (const name of normalized) {
		if ((byName.get(name)?.length ?? 0) !== 1) return null;
	}

	return normalized.map((name) => byName.get(name)![0]!);
}

export function aliasesAreUnambiguous(
	rows: readonly {locationId: string; name: string}[]
): boolean {
	const locationIdsByName = new Map<string, Set<string>>();
	for (const row of rows) {
		const locationIds = locationIdsByName.get(row.name);
		if (locationIds) locationIds.add(row.locationId);
		else locationIdsByName.set(row.name, new Set([row.locationId]));
	}
	return Array.from(locationIdsByName.values()).every(
		(locationIds) => locationIds.size === 1
	);
}
