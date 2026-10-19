import assert from 'node:assert/strict';
import test from 'node:test';

import {buildStaffRosterHtml} from './printStaffRoster';

const home = {name: 'Maple House', address: '12 Maple St', phone: '555-0100'};

test('lists every rostered staff member with title, hire date and status', () => {
	const html = buildStaffRosterHtml({
		home,
		roster: [
			{name: 'Ada Lovelace', title: 'DSP', dateOfHire: '2025-03-04', employmentStatus: 'active'},
			{name: 'Grace Hopper', title: null, dateOfHire: null, employmentStatus: 'inactive'},
		],
	});
	assert.match(html, /STAFF ROSTER/);
	assert.match(html, /Location: <span>Maple House/);
	assert.match(html, /12 Maple St/);
	assert.match(html, /Ada Lovelace/);
	assert.match(html, /03\/04\/2025/);
	assert.match(html, /Inactive/);
	assert.match(html, /Total staff: <span>2/);
});

test('escapes names so roster data cannot inject markup', () => {
	const html = buildStaffRosterHtml({
		home,
		roster: [{name: '<script>x</script>', title: null, dateOfHire: null, employmentStatus: null}],
	});
	assert.doesNotMatch(html, /<script>x<\/script>/);
});

test('says so when the roster is empty', () => {
	const html = buildStaffRosterHtml({home, roster: []});
	assert.match(html, /Nobody is on this roster yet/);
	assert.match(html, /Total staff: <span>0/);
});
