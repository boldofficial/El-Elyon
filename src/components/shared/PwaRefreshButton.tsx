'use client';

import {useEffect, useState} from 'react';
import {RefreshCw} from 'lucide-react';

type StandaloneNavigator = Navigator & {standalone?: boolean};

function isStandalonePwa() {
	if (typeof window === 'undefined') return false;

	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		window.matchMedia('(display-mode: fullscreen)').matches ||
		Boolean((window.navigator as StandaloneNavigator).standalone)
	);
}

async function clearAppCaches() {
	if (!('caches' in window)) return;

	const cacheNames = await caches.keys();
	await Promise.all(
		cacheNames
			.filter((name) => name.startsWith('el-elyon-'))
			.map((name) => caches.delete(name))
	);
}

async function forcePwaRefresh() {
	if ('serviceWorker' in navigator) {
		const registration = await navigator.serviceWorker.getRegistration('/');
		await registration?.update();

		const waitingWorker = registration?.waiting || registration?.installing;
		waitingWorker?.postMessage({type: 'SKIP_WAITING'});

		navigator.serviceWorker.controller?.postMessage({type: 'CLEAR_APP_CACHE'});
	}

	await clearAppCaches();
	await fetch(window.location.href, {cache: 'reload'}).catch(() => undefined);
	window.location.reload();
}

export function PwaRefreshButton() {
	const [visible, setVisible] = useState(false);
	const [refreshing, setRefreshing] = useState(false);

	useEffect(() => {
		setVisible(isStandalonePwa() && 'serviceWorker' in navigator);
	}, []);

	if (!visible) return null;

	return (
		<button
			type="button"
			onClick={async () => {
				if (refreshing) return;
				setRefreshing(true);
				await forcePwaRefresh();
			}}
			disabled={refreshing}
			className="fixed bottom-4 right-4 z-[9999] inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70"
			aria-label="Refresh app">
			<RefreshCw
				aria-hidden="true"
				className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
			/>
			<span>{refreshing ? 'Refreshing' : 'Refresh app'}</span>
		</button>
	);
}
