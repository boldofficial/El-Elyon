const DEFAULT_PREPARE_TIMEOUT_MS = 15_000;
const DEFAULT_CLEANUP_FALLBACK_MS = 1_500;

export class PrintDocumentError extends Error {
	constructor(message: string, options?: {cause?: unknown}) {
		super(message, options);
		this.name = 'PrintDocumentError';
	}
}

export interface PrintFrameHandle {
	waitForLoad(): Promise<void>;
	waitForFonts(): Promise<void>;
	waitForImages(): Promise<void>;
	onAfterPrint(callback: () => void): () => void;
	focus(): void;
	print(): void;
	remove(): void;
}

export interface PrintBrowserAdapter {
	createFrame(html: string): PrintFrameHandle;
	setTimer(callback: () => void, delayMs: number): unknown;
	clearTimer(timer: unknown): void;
}

export interface PrintDocumentOptions {
	adapter?: PrintBrowserAdapter;
	prepareTimeoutMs?: number;
	cleanupFallbackMs?: number;
	onError?: (error: PrintDocumentError) => void;
}

let printJobActive = false;

/**
 * Prints a complete, already-escaped HTML document in a hidden iframe.
 * Returns false when another print job is already active.
 */
export async function printDocument(
	html: string,
	options: PrintDocumentOptions = {}
): Promise<boolean> {
	if (printJobActive) return false;
	const adapter = options.adapter ?? createBrowserPrintAdapter();
	printJobActive = true;
	let frame: PrintFrameHandle | null = null;
	let prepareTimer: unknown;
	let cleanupTimer: unknown;
	let removeAfterPrintListener: (() => void) | null = null;
	let cleaned = false;

	const cleanup = () => {
		if (cleaned) return;
		cleaned = true;
		if (prepareTimer !== undefined) adapter.clearTimer(prepareTimer);
		if (cleanupTimer !== undefined) adapter.clearTimer(cleanupTimer);
		removeAfterPrintListener?.();
		frame?.remove();
		printJobActive = false;
	};

	try {
		frame = adapter.createFrame(html);
		await withTimeout(
			Promise.all([
				frame.waitForLoad().then(() => frame?.waitForFonts()),
				frame.waitForLoad().then(() => frame?.waitForImages())
			]),
			options.prepareTimeoutMs ?? DEFAULT_PREPARE_TIMEOUT_MS,
			adapter,
			(timer) => {
				prepareTimer = timer;
			}
		);

		removeAfterPrintListener = frame.onAfterPrint(cleanup);
		cleanupTimer = adapter.setTimer(
			cleanup,
			options.cleanupFallbackMs ?? DEFAULT_CLEANUP_FALLBACK_MS
		);
		frame.focus();
		frame.print();
		return true;
	} catch (cause) {
		cleanup();
		const error =
			cause instanceof PrintDocumentError
				? cause
				: new PrintDocumentError('Unable to prepare the document for printing', {cause});
		options.onError?.(error);
		throw error;
	}
}

export function escapePrintHtml(value: unknown): string {
	if (value === null || value === undefined) return '';
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function createBrowserPrintAdapter(): PrintBrowserAdapter {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		throw new PrintDocumentError('Printing is only available in a browser');
	}

	return {
		createFrame(html) {
			const iframe = document.createElement('iframe');
			iframe.setAttribute('aria-hidden', 'true');
			iframe.tabIndex = -1;
			Object.assign(iframe.style, {
				position: 'fixed',
				right: '0',
				bottom: '0',
				width: '0',
				height: '0',
				border: '0',
				visibility: 'hidden'
			});

			let resolveLoad: (() => void) | null = null;
			let rejectLoad: ((error: Error) => void) | null = null;
			const loadPromise = new Promise<void>((resolve, reject) => {
				resolveLoad = resolve;
				rejectLoad = reject;
			});
			iframe.addEventListener('load', () => resolveLoad?.(), {once: true});
			iframe.addEventListener(
				'error',
				() => rejectLoad?.(new PrintDocumentError('The print frame failed to load')),
				{once: true}
			);
			iframe.srcdoc = html;
			document.body.appendChild(iframe);

			const frameDocument = () => {
				const doc = iframe.contentDocument;
				if (!doc) throw new PrintDocumentError('The print frame is unavailable');
				return doc;
			};

			return {
				waitForLoad: () => loadPromise,
				async waitForFonts() {
					const fonts = frameDocument().fonts;
					if (fonts) await fonts.ready;
				},
				async waitForImages() {
					await Promise.all(Array.from(frameDocument().images).map(waitForImage));
				},
				onAfterPrint(callback) {
					const frameWindow = iframe.contentWindow;
					if (!frameWindow) throw new PrintDocumentError('The print window is unavailable');
					frameWindow.addEventListener('afterprint', callback, {once: true});
					return () => frameWindow.removeEventListener('afterprint', callback);
				},
				focus() {
					iframe.contentWindow?.focus();
				},
				print() {
					const frameWindow = iframe.contentWindow;
					if (!frameWindow) throw new PrintDocumentError('The print window is unavailable');
					frameWindow.print();
				},
				remove() {
					iframe.remove();
				}
			};
		},
		setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
		clearTimer: (timer) => window.clearTimeout(timer as number)
	};
}

async function waitForImage(image: HTMLImageElement): Promise<void> {
	if (typeof image.decode === 'function') {
		try {
			await image.decode();
			return;
		} catch (cause) {
			throw new PrintDocumentError('A print image failed to decode', {cause});
		}
	}
	if (image.complete && image.naturalWidth > 0) return;
	await new Promise<void>((resolve, reject) => {
		image.addEventListener('load', () => resolve(), {once: true});
		image.addEventListener(
			'error',
			() => reject(new PrintDocumentError('A print image failed to load')),
			{once: true}
		);
	});
}

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	adapter: PrintBrowserAdapter,
	setTimerReference: (timer: unknown) => void
): Promise<T> {
	let timeoutTimer: unknown;
	const timeout = new Promise<never>((_, reject) => {
		timeoutTimer = adapter.setTimer(
			() => reject(new PrintDocumentError('Timed out while loading print resources')),
			timeoutMs
		);
		setTimerReference(timeoutTimer);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		adapter.clearTimer(timeoutTimer);
	}
}
