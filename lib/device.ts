const STORAGE_KEY = 'kiosk_device_id';

// Module-level cache — safe because ID never changes
let cachedDeviceId: string | null = null;

// Safe localStorage helpers
function safeStorageGet(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function safeStorageSet(key: string, value: string): void {
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
 */
export async function initializeDeviceId(): Promise<string> {
	// Check cache first
	if (cachedDeviceId) {
		return cachedDeviceId;
	}

	// Check localStorage
	let deviceId = safeStorageGet(STORAGE_KEY);
	if (deviceId) {
		cachedDeviceId = deviceId;
		return deviceId;
	}

	// Generate new ID
	const fingerprint = await generateStableFingerprint();
	deviceId = `device_${fingerprint.substring(0, 16)}`;
	safeStorageSet(STORAGE_KEY, deviceId);
	cachedDeviceId = deviceId;
	return deviceId;
}

/**
 * Sync access to device ID (safe to call after initializeDeviceId)
 */
export function getDeviceId(): string {
	if (cachedDeviceId) {
		return cachedDeviceId;
	}
	// Fallback: try localStorage (in case called before init — shouldn't happen in your flow)
	const fromStorage = safeStorageGet(STORAGE_KEY);
	if (fromStorage) {
		cachedDeviceId = fromStorage;
		return fromStorage;
	}
	// Last resort: this should not occur in normal flow
	throw new Error(
		'Device ID not initialized. Call initializeDeviceId() first.'
	);
}

/**
 * For debugging during kiosk setup
 */
export async function debugDeviceId(): Promise<void> {
	const id = await initializeDeviceId();
	console.log('✅ Kiosk Device ID:', id);
}
