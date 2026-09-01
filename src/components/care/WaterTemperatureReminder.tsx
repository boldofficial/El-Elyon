// src/components/care/WaterTemperatureReminder.tsx

'use client';

import React, {useEffect, useRef} from 'react';
import type {WaterTemperatureStatus} from '@/db/queries/water-temperature';
import {
	WATER_TEMPERATURE_ELEMENT_IDS,
	deriveWaterTemperatureBadge,
	deriveWaterTemperatureBanner,
} from './waterTemperatureEntryModel';

// All state/severity decisions live in waterTemperatureEntryModel.ts and are
// tested there; this file only renders what the model returns and owns the
// one effect that cannot be a value (moving focus into urgent content).

const SEVERITY_STYLES = {
	amber: {
		container: 'bg-amber-50 border-amber-300 text-amber-900',
		cta: 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500',
		secondary: 'border-amber-400 text-amber-900 hover:bg-amber-100 focus-visible:ring-amber-500',
		badge: 'bg-amber-400 text-amber-950',
	},
	red: {
		container: 'bg-red-50 border-red-400 text-red-900',
		cta: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500',
		secondary: 'border-red-400 text-red-900 hover:bg-red-100 focus-visible:ring-red-500',
		badge: 'bg-red-500 text-white',
	},
} as const;

// 44px minimum touch target on every interactive control.
const TOUCH_TARGET =
	'min-h-[44px] min-w-[44px] inline-flex items-center justify-center ' +
	'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

interface WaterTemperatureReminderProps {
	status: WaterTemperatureStatus;
	/** True while a status refetch is in flight, so the retry control can
	 * describe itself accurately instead of appearing inert. */
	isRefreshing?: boolean;
	onOpen: () => void;
	onRetry: () => void;
}

/**
 * The non-dismissible portal banner (R8/KTD5). "Non-dismissible" means there
 * is no close control and no client-side dismissal state at all: the banner
 * disappears only when the server-derived status stops warranting it. It
 * never blocks unrelated work.
 */
export default function WaterTemperatureReminder({
	status,
	isRefreshing = false,
	onOpen,
	onRetry,
}: WaterTemperatureReminderProps) {
	const banner = deriveWaterTemperatureBanner(status);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const lastFocusedStatusRef = useRef<WaterTemperatureStatus | null>(null);

	// Move focus into urgent action content once per transition into an
	// urgent state, so a keyboard/screen-reader user is placed on the safety
	// instructions rather than having to hunt for them. Repeated polls that
	// return the same status must not steal focus again.
	useEffect(() => {
		if (!banner?.focusOnAppear) {
			if (!banner) lastFocusedStatusRef.current = null;
			return;
		}
		if (lastFocusedStatusRef.current === status) return;
		lastFocusedStatusRef.current = status;
		containerRef.current?.focus();
	}, [banner, status]);

	if (!banner) return null;

	const styles = SEVERITY_STYLES[banner.severity];

	return (
		<div
			id={WATER_TEMPERATURE_ELEMENT_IDS.banner}
			ref={containerRef}
			tabIndex={-1}
			role={banner.role}
			aria-live={banner.ariaLive}
			aria-atomic="true"
			className={`mb-6 rounded-lg border-2 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${styles.container}`}>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start">
				<span aria-hidden="true" className="text-2xl leading-none sm:mt-0.5">
					{banner.icon}
				</span>
				<div className="flex-1 min-w-0">
					<p className="font-semibold">
						{/* The status word is always present as text, so the state is
						    never conveyed by colour or icon alone. */}
						<span className="uppercase tracking-wide text-xs mr-2 px-2 py-0.5 rounded border border-current align-middle">
							{banner.iconLabel}
						</span>
						{banner.title}
					</p>
					<p className="mt-1 text-sm">{banner.body}</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:shrink-0">
					<button
						id={WATER_TEMPERATURE_ELEMENT_IDS.bannerCta}
						type="button"
						onClick={onOpen}
						className={`${TOUCH_TARGET} rounded-lg px-4 py-2 text-white font-medium transition-colors ${styles.cta}`}>
						{banner.ctaLabel}
					</button>
					{banner.showRetry && (
						<button
							type="button"
							onClick={onRetry}
							disabled={isRefreshing}
							className={`${TOUCH_TARGET} rounded-lg border-2 bg-white/60 px-4 py-2 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${styles.secondary}`}>
							{isRefreshing ? 'Checking…' : 'Retry'}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

/**
 * The navigation badge companion to the banner. Rendered inside the portal's
 * sidebar item so the obligation stays visible from every view, including
 * ones whose content does not show the banner.
 */
export function WaterTemperatureNavBadge({status}: {status: WaterTemperatureStatus}) {
	const badge = deriveWaterTemperatureBadge(status);
	if (!badge) return null;
	return (
		<span
			className={`ml-2 px-2 py-0.5 text-xs font-semibold rounded-full ${SEVERITY_STYLES[badge.severity].badge}`}>
			<span aria-hidden="true">{badge.label}</span>
			<span className="sr-only">{badge.srLabel}</span>
		</span>
	);
}
