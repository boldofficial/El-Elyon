'use client';

import {useAuth, useClerk} from '@clerk/nextjs';
import {useEffect, useRef, useState} from 'react';
import {getIdlePhase, IDLE_POLICY} from '@/lib/idle-timeout';

// Shared by every tab on the device so activity in one tab keeps the others alive.
const STORAGE_KEY = 'el-elyon:last-activity';
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
// Activity events fire constantly; don't hit localStorage more than once a second.
const WRITE_THROTTLE_MS = 1000;

type Stamp = {sessionId: string; at: number};

// Fallback when storage is blocked (private mode, cleared site data).
let memoryStamp: Stamp | null = null;

function readStamp(): Stamp | null {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw) as Stamp;
	} catch {}
	return memoryStamp;
}

function writeStamp(stamp: Stamp) {
	memoryStamp = stamp;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stamp));
	} catch {}
}

/**
 * Signs the user out after IDLE_POLICY.timeoutMs without interaction, with a
 * countdown warning first. Ending the Clerk session does NOT end the shift —
 * the shift row stays open and CarePortal resumes it on the next sign-in.
 */
export function IdleSignOut() {
	const {isSignedIn, sessionId} = useAuth();
	const {signOut} = useClerk();
	const [msLeft, setMsLeft] = useState<number | null>(null);
	const signingOutRef = useRef(false);

	useEffect(() => {
		if (!isSignedIn || !sessionId) {
			setMsLeft(null);
			return;
		}
		signingOutRef.current = false;

		// A stamp from a different session is stale (previous user on this
		// device); start this session's clock now. A stamp from THIS session is
		// kept, so reloading the page after sitting idle still signs out.
		const existing = readStamp();
		if (!existing || existing.sessionId !== sessionId) {
			writeStamp({sessionId, at: Date.now()});
		}

		let lastWrite = 0;
		const onActivity = () => {
			if (signingOutRef.current) return;
			const now = Date.now();
			if (now - lastWrite < WRITE_THROTTLE_MS) return;
			lastWrite = now;
			writeStamp({sessionId, at: now});
		};

		const check = () => {
			if (signingOutRef.current) return;
			const stamp = readStamp();
			const at = stamp?.sessionId === sessionId ? stamp.at : Date.now();
			const phase = getIdlePhase(at, Date.now());
			if (phase.kind === 'expired') {
				signingOutRef.current = true;
				setMsLeft(null);
				signOut({redirectUrl: '/'}).catch((error) => {
					console.error('Idle sign-out failed:', error);
					signingOutRef.current = false;
				});
			} else {
				setMsLeft(phase.kind === 'warning' ? phase.msLeft : null);
			}
		};

		// Timers are throttled in background tabs and frozen while a tablet
		// sleeps, so re-check the moment the page becomes visible again.
		const onVisible = () => {
			if (document.visibilityState === 'visible') check();
		};

		for (const event of ACTIVITY_EVENTS) {
			window.addEventListener(event, onActivity, {passive: true, capture: true});
		}
		document.addEventListener('visibilitychange', onVisible);
		const interval = window.setInterval(check, 1000);
		check();

		return () => {
			for (const event of ACTIVITY_EVENTS) {
				window.removeEventListener(event, onActivity, {capture: true});
			}
			document.removeEventListener('visibilitychange', onVisible);
			window.clearInterval(interval);
		};
	}, [isSignedIn, sessionId, signOut]);

	if (msLeft === null || !sessionId) return null;

	const seconds = Math.ceil(msLeft / 1000);
	const stay = () => writeStamp({sessionId, at: Date.now()});
	const signOutNow = () => {
		signingOutRef.current = true;
		signOut({redirectUrl: '/'});
	};

	return (
		<div
			className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 p-4"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="idle-signout-title">
			<div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
				<h2 id="idle-signout-title" className="text-xl font-bold text-gray-900">
					Still there?
				</h2>
				<p className="mt-2 text-gray-600">
					For resident privacy you&apos;ll be signed out in{' '}
					<span className="font-semibold tabular-nums text-gray-900">
						{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
					</span>
					. Your shift stays clocked in.
				</p>
				<div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
					<button
						className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
						onClick={stay}
						autoFocus>
						Stay signed in
					</button>
					<button
						className="rounded border border-gray-200 bg-white px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50"
						onClick={signOutNow}>
						Sign out now
					</button>
				</div>
			</div>
		</div>
	);
}
