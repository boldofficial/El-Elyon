export async function collectLegacyPages<T>(
	fetchPage: (cursor: string | null) => Promise<{data: T[]; nextCursor: string | null}>,
	maximumPages = 100
): Promise<T[]> {
	const rows: T[] = [];
	let cursor: string | null = null;
	for (let page = 0; page < maximumPages; page += 1) {
		const result = await fetchPage(cursor);
		rows.push(...result.data);
		if (!result.nextCursor) return rows;
		if (result.nextCursor === cursor) {
			throw new Error('Legacy pagination returned the same cursor twice');
		}
		cursor = result.nextCursor;
	}
	throw new Error('Legacy history exceeded the supported pagination limit');
}

export async function readLifeSafetyResponse<T = unknown>(response: Response): Promise<T> {
	let payload: unknown = null;
	try {
		payload = await response.json();
	} catch {
		// Preserve the status-based error when an upstream response is not JSON.
	}
	if (!response.ok) {
		const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
			? payload.error
			: `Request failed (${response.status})`;
		throw new Error(message);
	}
	return payload as T;
}

export function lifeSafetyErrorMessage(error: unknown, fallback: string) {
	return error instanceof Error && error.message ? error.message : fallback;
}
