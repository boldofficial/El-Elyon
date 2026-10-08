// Idle auto sign-out policy. Pure logic only — the browser wiring lives in
// src/components/auth/IdleSignOut.tsx so this file can be unit tested.

export const IDLE_POLICY = {
	/** Total inactivity before the session is ended. */
	timeoutMs: 5 * 60 * 1000,
	/** How long before the timeout the "Still there?" warning appears. */
	warningMs: 60 * 1000,
} as const;

export type IdlePolicy = {timeoutMs: number; warningMs: number};

export type IdlePhase =
	| {kind: 'active'}
	| {kind: 'warning'; msLeft: number}
	| {kind: 'expired'};

/**
 * Decide where a session stands given the last recorded activity.
 *
 * `lastActivityAt` comes from localStorage and is shared by every open tab, so
 * it may have been written by another tab — and on a misconfigured device it
 * can even be slightly in the future relative to `now`.
 */
export function getIdlePhase(
	lastActivityAt: number,
	now: number,
	policy: IdlePolicy = IDLE_POLICY,
): IdlePhase {
	// A stamp in the future means the device clock was corrected backwards;
	// count it as fresh activity rather than signing someone out mid-task.
	const idleMs = Math.max(0, now - lastActivityAt);
	if (idleMs >= policy.timeoutMs) return {kind: 'expired'};
	const msLeft = policy.timeoutMs - idleMs;
	if (msLeft <= policy.warningMs) return {kind: 'warning', msLeft};
	return {kind: 'active'};
}
