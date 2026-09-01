export type LifeSafetyInspectionScope = {
	locationId: string;
	year: number;
};

export type LifeSafetyInspectionLoadState = 'idle' | 'loading' | 'ready' | 'error';

export function isLifeSafetyInspectionScopeReady(args: {
	currentScope: LifeSafetyInspectionScope | null;
	loadedScope: LifeSafetyInspectionScope | null;
	recordsState: LifeSafetyInspectionLoadState;
}): boolean {
	return (
		args.recordsState === 'ready' &&
		sameLifeSafetyInspectionScope(args.currentScope, args.loadedScope)
	);
}

export function sameLifeSafetyInspectionScope(
	left: LifeSafetyInspectionScope | null | undefined,
	right: LifeSafetyInspectionScope | null | undefined
): boolean {
	return Boolean(
		left &&
			right &&
			left.locationId === right.locationId &&
			left.year === right.year
	);
}
