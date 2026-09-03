import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildAnnualInspectionPrintHtml,
	buildFireDrillPrintHtml,
	type PrintableFireDrillParticipant
} from './printLifeSafetyReports';

test('annual inspection sheet renders every month and photographed equipment groups', () => {
	const html = buildAnnualInspectionPrintHtml({
		houseName: 'House A',
		year: 2026,
		entries: [
			{reportMonth: 1, equipmentType: 'smoke', inspectionDate: '2026-01-09', staffInitials: 'MS'},
			{reportMonth: 1, equipmentType: 'carbon_monoxide', inspectionDate: '2026-01-10', staffInitials: 'AB'},
			{reportMonth: 1, equipmentType: 'fire_extinguisher', inspectionDate: '2026-01-11', staffInitials: 'CD'}
		]
	});

	assert.match(html, /size: Letter portrait/);
	assert.match(html, /All Smoke<br \/>Detectors/);
	assert.match(html, /All CO Detectors/);
	assert.match(html, /All Fire Extinguishers/);
	assert.match(html, /House A/);
	assert.match(html, /01\/09\/2026/);
	for (const month of ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']) {
		assert.equal((html.match(new RegExp(`>${month}<`, 'g')) ?? []).length, 1);
	}
});

test('fire drill sheet renders a populated semi-annual section and blank annual section', () => {
	const html = buildFireDrillPrintHtml({
		houseName: 'Cedar House',
		year: 2026,
		reports: [{
			sequence: 1,
			drillDate: '2026-02-01',
			drillTime: '13:05:00',
			staffNames: ['Morgan Smith'],
			participants: [participant('Resident One', 0)]
		}]
	});

	assert.match(html, /size: Letter landscape/);
	assert.match(html, />SEMI-ANNUAL FIRE DRILL</);
	assert.match(html, />ANNUAL FIRE DRILL</);
	assert.match(html, /02\/01\/2026 1:05 PM/);
	assert.match(html, /Resident One/);
	assert.equal((html.match(/class="drill-page"/g) ?? []).length, 1);
});

test('five residents create one continuation page without dropping or duplicating anyone', () => {
	const residents = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
	const html = buildFireDrillPrintHtml({
		houseName: 'House A',
		year: 2026,
		reports: [{
			sequence: 1,
			drillDate: '2026-06-10',
			drillTime: '09:00',
			staffNames: ['Staff'],
			participants: residents.map((name, index) => participant(name, index))
		}]
	});

	assert.equal((html.match(/class="drill-page"/g) ?? []).length, 2);
	assert.match(html, /SEMI-ANNUAL FIRE DRILL — CONTINUED/);
	for (const name of residents) assert.equal((html.match(new RegExp(`>${name}<`, 'g')) ?? []).length, 1);
});

test('all record values stay in escaped text slots and cannot create resources or markup', () => {
	const attack = `</style><img src="javascript:alert(1)" onerror="alert(2)">& " ' <script>`;
	const html = buildFireDrillPrintHtml({
		houseName: attack,
		year: 2026,
		reports: [{
			sequence: 1,
			drillDate: '2026-01-01',
			drillTime: '08:00',
			staffNames: [attack],
			participants: [{...participant(attack, 0), comment: `${attack}\nsecond line`}]
		}]
	});

	assert.doesNotMatch(html, /<script>/);
	assert.doesNotMatch(html, /src="javascript:/);
	assert.doesNotMatch(html, / onerror="/);
	assert.equal((html.match(/<img src=/g) ?? []).length, 1);
	assert.equal((html.match(/<style>/g) ?? []).length, 1);
	assert.match(html, /&lt;\/style&gt;&lt;img src=&quot;javascript:alert\(1\)&quot;/);
	assert.doesNotMatch(html, />null<|>undefined</);
});

test('renderers reject duplicate slots and oversized bounded collections', () => {
	assert.throws(() => buildAnnualInspectionPrintHtml({
		houseName: 'House',
		year: 2026,
		entries: [
			{reportMonth: 1, equipmentType: 'smoke', inspectionDate: '2026-01-01', staffInitials: 'A'},
			{reportMonth: 1, equipmentType: 'smoke', inspectionDate: '2026-01-02', staffInitials: 'B'}
		]
	}), /Duplicate inspection/);

	assert.throws(() => buildFireDrillPrintHtml({
		houseName: 'House',
		year: 2026,
		reports: [{
			sequence: 1,
			drillDate: '2026-01-01',
			drillTime: '08:00',
			staffNames: ['Staff'],
			participants: Array.from({length: 65}, (_, index) => participant(`Resident ${index}`, index))
		}]
	}), /at most 64 participants/);
});

function participant(name: string, position: number): PrintableFireDrillParticipant {
	return {
		residentNameSnapshot: name,
		durationMinutes: position,
		durationSeconds: position % 60,
		comment: position === 0 ? 'All clear' : null,
		position
	};
}
