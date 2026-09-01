import assert from 'node:assert/strict';
import test from 'node:test';
import {
	PrintDocumentError,
	printDocument,
	type PrintBrowserAdapter,
	type PrintFrameHandle
} from './printDocument';
import {buildIncidentPrintHtml} from '../care/printIncidentReport';

type Deferred = {resolve: () => void; reject: (error: Error) => void; promise: Promise<void>};

function deferred(): Deferred {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return {resolve, reject, promise};
}

function fakeAdapter(args: {
	load?: Deferred;
	fonts?: Deferred;
	images?: Deferred;
	afterPrintImmediately?: boolean;
} = {}) {
	const load = args.load ?? deferred();
	const fonts = args.fonts ?? deferred();
	const images = args.images ?? deferred();
	if (!args.load) load.resolve();
	if (!args.fonts) fonts.resolve();
	if (!args.images) images.resolve();
	const events: string[] = [];
	const timers: Array<{callback: () => void; cleared: boolean}> = [];
	let afterPrint: (() => void) | null = null;

	const frame: PrintFrameHandle = {
		waitForLoad: () => load.promise,
		waitForFonts: () => fonts.promise,
		waitForImages: () => images.promise,
		onAfterPrint(callback) {
			afterPrint = callback;
			return () => {
				afterPrint = null;
			};
		},
		focus: () => events.push('focus'),
		print() {
			events.push('print');
			if (args.afterPrintImmediately) afterPrint?.();
		},
		remove: () => events.push('remove')
	};
	const adapter: PrintBrowserAdapter = {
		createFrame(html) {
			events.push(`create:${html}`);
			return frame;
		},
		setTimer(callback) {
			const timer = {callback, cleared: false};
			timers.push(timer);
			return timer;
		},
		clearTimer(timer) {
			(timer as {cleared: boolean}).cleared = true;
		}
	};
	return {
		adapter,
		events,
		load,
		fonts,
		images,
		runTimers: () => timers.filter((timer) => !timer.cleared).forEach((timer) => timer.callback())
	};
}

test('waits for load, fonts, and images before printing and cleans up afterprint', async () => {
	const load = deferred();
	const fonts = deferred();
	const images = deferred();
	const fake = fakeAdapter({load, fonts, images, afterPrintImmediately: true});
	const printing = printDocument('<p>safe</p>', {adapter: fake.adapter});

	await Promise.resolve();
	assert.deepEqual(fake.events, ['create:<p>safe</p>']);
	load.resolve();
	await Promise.resolve();
	assert.equal(fake.events.includes('print'), false);
	fonts.resolve();
	await Promise.resolve();
	assert.equal(fake.events.includes('print'), false);
	images.resolve();
	assert.equal(await printing, true);
	assert.deepEqual(fake.events, ['create:<p>safe</p>', 'focus', 'print', 'remove']);
});

test('ignores a second print while a job is active and fallback cleanup releases the guard', async () => {
	const fake = fakeAdapter();
	assert.equal(await printDocument('first', {adapter: fake.adapter}), true);
	assert.equal(await printDocument('second', {adapter: fake.adapter}), false);
	assert.equal(fake.events.filter((event) => event.startsWith('create:')).length, 1);
	fake.runTimers();
	assert.equal(fake.events.at(-1), 'remove');

	const next = fakeAdapter({afterPrintImmediately: true});
	assert.equal(await printDocument('third', {adapter: next.adapter}), true);
});

test('resource failures remove the frame, report an error, and never print', async () => {
	const fonts = deferred();
	const fake = fakeAdapter({fonts});
	const failure = new Error('font unavailable');
	const reported: PrintDocumentError[] = [];
	fonts.reject(failure);

	await assert.rejects(
		printDocument('broken', {adapter: fake.adapter, onError: (error) => reported.push(error)}),
		PrintDocumentError
	);
	assert.equal(fake.events.includes('print'), false);
	assert.equal(fake.events.at(-1), 'remove');
	assert.equal(reported.length, 1);
	assert.equal((reported[0] as Error & {cause?: unknown}).cause, failure);
});

test('load and image failures also clean up without printing stale content', async () => {
	for (const resource of ['load', 'images'] as const) {
		const pending = deferred();
		const fake = fakeAdapter({[resource]: pending});
		pending.reject(new Error(`${resource} unavailable`));
		await assert.rejects(printDocument('broken', {adapter: fake.adapter}), PrintDocumentError);
		assert.equal(fake.events.includes('print'), false);
		assert.equal(fake.events.at(-1), 'remove');
	}
});

test('prepare timeouts fail cleanly, report the error, and release the print guard', async () => {
	const load = deferred();
	const fake = fakeAdapter({load});
	const reported: PrintDocumentError[] = [];
	const printing = printDocument('slow', {
		adapter: fake.adapter,
		prepareTimeoutMs: 1,
		onError: (error) => reported.push(error),
	});

	await Promise.resolve();
	fake.runTimers();
	await assert.rejects(printing, PrintDocumentError);
	assert.equal(fake.events.includes('print'), false);
	assert.equal(fake.events.at(-1), 'remove');
	assert.equal(reported.length, 1);
	assert.equal(reported[0]?.message, 'Timed out while loading print resources');
});

test('incident report HTML remains available through the extracted shared runner boundary', () => {
	const html = buildIncidentPrintHtml({
		id: 'incident-1',
		incidentDate: '2026-08-30T15:30:00Z',
		incidentType: 'Safety',
		severity: 'high',
		description: '<script>alert(1)</script>',
		resident: {name: 'A & B'}
	});
	assert.match(html, /Incident Report/);
	assert.match(html, /A &amp; B/);
	assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
	assert.doesNotMatch(html, /<script>/);
});
