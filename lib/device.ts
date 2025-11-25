const STORAGE_KEY = 'kiosk_device_id';

// Module-level cache — safe because ID never changes once set
let cachedDeviceId: string | null = null;

// Safe localStorage helpers
function safeStorageGet(key: string): string | null {
	if (typeof window === 'undefined') return null;
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function safeStorageSet(key: string, value: string): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(key, value);
	} catch {
		// Ignore (private browsing, etc.)
	}
}

/**
 * Generates a stable, deterministic device fingerprint
 */
async function generateStableFingerprint(): Promise<string> {
	const components = [
		navigator.userAgent,
		navigator.platform,
		String(navigator.hardwareConcurrency ?? 0),
		String(
			(navigator as Navigator & {deviceMemory?: number}).deviceMemory ?? 0
		),
		`${screen.width}x${screen.height}`,
		String(screen.colorDepth),
		navigator.language,
		await getCanvasFingerprint(),
	];

	const data = components.join('|');
	const encoder = new TextEncoder();
	const hashBuffer = await crypto.subtle.digest(
		'SHA-256',
		encoder.encode(data)
	);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getCanvasFingerprint(): Promise<string> {
	try {
		const canvas = document.createElement('canvas');
		canvas.width = 200;
		canvas.height = 50;
		const ctx = canvas.getContext('2d');
		if (!ctx) return 'no-canvas';
		ctx.textBaseline = 'top';
		ctx.font = "18px 'Helvetica', Arial";
		ctx.fillStyle = '#f60';
		ctx.fillRect(0, 0, 200, 50);
		ctx.fillStyle = '#000';
		ctx.fillText('KioskAuth', 5, 5);
		return canvas.toDataURL();
	} catch {
		return 'canvas-error';
	}
}

/**
 * Initialize device ID (call once at app startup)
 * Returns the same ID every time - only generates once per device
 */
export async function initializeDeviceId(): Promise<string> {
	// 1. Check module cache first (fastest)
	if (cachedDeviceId) {
		console.log('📱 Device ID from cache:', cachedDeviceId);
		return cachedDeviceId;
	}

	// 2. Check localStorage (persisted across sessions)
	const storedId = safeStorageGet(STORAGE_KEY);
	if (storedId) {
		cachedDeviceId = storedId;
		console.log('📱 Device ID from localStorage:', storedId);
		return storedId;
	}

	// 3. Generate new ID only if not found anywhere
	console.log('🔧 Generating new device ID...');
	const fingerprint = await generateStableFingerprint();
	const newDeviceId = `device_${fingerprint.substring(0, 16)}`;

	// Save to localStorage AND cache
	safeStorageSet(STORAGE_KEY, newDeviceId);
	cachedDeviceId = newDeviceId;

	console.log('✅ New device ID created:', newDeviceId);
	return newDeviceId;
}

/**
 * Sync access to device ID (safe to call after initializeDeviceId)
 */
export function getDeviceId(): string {
	// Check cache first
	if (cachedDeviceId) {
		return cachedDeviceId;
	}

	// Fallback: try localStorage (in case called before init)
	const fromStorage = safeStorageGet(STORAGE_KEY);
	if (fromStorage) {
		cachedDeviceId = fromStorage;
		return fromStorage;
	}

	// Return empty string instead of throwing (safer for SSR)
	console.warn('⚠️ Device ID not initialized yet');
	return '';
}

/**
 * For debugging during kiosk setup
 */
export async function debugDeviceId(): Promise<void> {
	const id = await initializeDeviceId();
	console.log('✅ Kiosk Device ID:', id);
}

/**
 * Clear device ID (for testing/reset purposes)
 */
export function clearDeviceId(): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.removeItem(STORAGE_KEY);
		cachedDeviceId = null;
		console.log('🗑️ Device ID cleared');
	} catch {
		// Ignore
	}
}
