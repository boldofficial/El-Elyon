import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getIdlePhase, IDLE_POLICY} from './idle-timeout';

const T0 = Date.UTC(2026, 9, 7, 14, 0, 0);
const sec = (s: number) => s * 1000;

test('fresh activity is active', () => {
	assert.deepEqual(getIdlePhase(T0, T0), {kind: 'active'});
});

test('just before the warning window is still active', () => {
	const now = T0 + IDLE_POLICY.timeoutMs - IDLE_POLICY.warningMs - 1;
	assert.deepEqual(getIdlePhase(T0, now), {kind: 'active'});
});

test('inside the warning window reports time left', () => {
	const now = T0 + IDLE_POLICY.timeoutMs - sec(30);
	assert.deepEqual(getIdlePhase(T0, now), {kind: 'warning', msLeft: sec(30)});
});

test('exactly at the timeout is expired', () => {
	assert.deepEqual(getIdlePhase(T0, T0 + IDLE_POLICY.timeoutMs), {kind: 'expired'});
});

test('a device that slept for an hour is expired on wake', () => {
	assert.deepEqual(getIdlePhase(T0, T0 + 60 * 60 * 1000), {kind: 'expired'});
});

test('a stamp from the future counts as fresh activity', () => {
	assert.deepEqual(getIdlePhase(T0 + sec(10), T0), {kind: 'active'});
});
