// src/components/care/glucosePresentation.ts
//
// Shared look of blood sugar statuses so the resident tab, the oversight
// table, the dashboard and the print sheet all read the same way.

import {
	RECHECK_MINUTES,
	type GlucoseStatus,
} from '@/lib/blood-glucose';

export const GLUCOSE_STATUS_CHIP: Record<GlucoseStatus, string> = {
	critical_low: 'bg-red-600 text-white',
	in_range: 'bg-green-100 text-green-800 border border-green-300',
	critical_high: 'bg-red-600 text-white',
	refused: 'bg-gray-100 text-gray-700 border border-gray-300',
};

/** What staff should do next, shown under the live status while entering a reading. */
export function glucoseGuidance(status: GlucoseStatus): string | null {
	const minutes = RECHECK_MINUTES[status];
	switch (status) {
		case 'critical_low':
			return `Critical low. Record any symptoms. If the resident has symptoms, give juice or sugar per their orders and tell the nurse or supervisor. Recheck in ${minutes} minutes. Call 911 if the resident cannot swallow safely or is not responding.`;
		case 'critical_high':
			return `Critical high. Record any symptoms. If the resident has symptoms, follow their orders and tell the nurse or supervisor. Recheck in ${minutes} minutes.`;
		default:
			return null;
	}
}

export function formatDay(isoDate: string) {
	const [y, m, d] = isoDate.split('-').map(Number);
	return new Date(y, m - 1, d).toLocaleDateString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	});
}

export function formatClock(iso: string) {
	return new Date(iso).toLocaleTimeString(undefined, {
		hour: 'numeric',
		minute: '2-digit',
	});
}

export function formatDateTime(iso: string) {
	return new Date(iso).toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}

/** Value for an <input type="datetime-local"> in the browser's timezone. */
export function toLocalInputValue(date: Date) {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
		date.getHours()
	)}:${pad(date.getMinutes())}`;
}
