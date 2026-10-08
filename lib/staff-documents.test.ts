import assert from 'node:assert/strict';
import test from 'node:test';
import {
	STAFF_DOCUMENT_CATEGORIES,
	STAFF_DOCUMENT_CATEGORY_LABELS,
	STAFF_DOCUMENT_CATEGORY_SCOPE,
	canViewStaffDocument,
	resolveStaffDocumentTarget,
} from './staff-documents';

const EMPLOYEE = '5a000000-0000-4000-8000-000000000001';
const MAPLE = 'Maple House';
const OAK = 'Oak House';

test('every category has a label and a scope', () => {
	for (const category of STAFF_DOCUMENT_CATEGORIES) {
		assert.ok(STAFF_DOCUMENT_CATEGORY_LABELS[category]);
		assert.ok(STAFF_DOCUMENT_CATEGORY_SCOPE[category]);
	}
});

test('per-person categories must be filed under an employee', () => {
	for (const category of ['training', 'background_check', 'tb_test', 'job_application']) {
		assert.equal(resolveStaffDocumentTarget({category, location: MAPLE}).ok, false);
		assert.deepEqual(resolveStaffDocumentTarget({category, employeeId: EMPLOYEE}), {
			ok: true,
			category,
			employeeId: EMPLOYEE,
			location: null,
		});
	}
});

test('facility-wide categories must be filed under a location', () => {
	for (const category of ['staff_roster', 'prn_staff', 'cla']) {
		assert.equal(resolveStaffDocumentTarget({category, employeeId: EMPLOYEE}).ok, false);
		assert.equal(resolveStaffDocumentTarget({category, location: ` ${MAPLE} `}).ok, true);
	}
});

test('miscellaneous takes either, but not neither and not both', () => {
	assert.equal(resolveStaffDocumentTarget({category: 'miscellaneous', employeeId: EMPLOYEE}).ok, true);
	assert.equal(resolveStaffDocumentTarget({category: 'miscellaneous', location: MAPLE}).ok, true);
	assert.equal(resolveStaffDocumentTarget({category: 'miscellaneous'}).ok, false);
	assert.equal(
		resolveStaffDocumentTarget({category: 'miscellaneous', employeeId: EMPLOYEE, location: MAPLE}).ok,
		false
	);
});

test('unknown categories and blank targets are refused', () => {
	assert.equal(resolveStaffDocumentTarget({category: 'payroll', employeeId: EMPLOYEE}).ok, false);
	assert.equal(resolveStaffDocumentTarget({category: 'tb_test', employeeId: '   '}).ok, false);
});

const supervisorAtMaple = {role: 'supervisor', locations: [MAPLE]};

test('admins see every document', () => {
	const admin = {role: 'admin', locations: []};
	assert.equal(canViewStaffDocument(admin, {location: OAK, employeeId: null, employeeLocations: null}), true);
	assert.equal(canViewStaffDocument(admin, {location: null, employeeId: EMPLOYEE, employeeLocations: []}), true);
});

test('supervisors see facility documents only at their own locations', () => {
	assert.equal(
		canViewStaffDocument(supervisorAtMaple, {location: MAPLE, employeeId: null, employeeLocations: null}),
		true
	);
	assert.equal(
		canViewStaffDocument(supervisorAtMaple, {location: OAK, employeeId: null, employeeLocations: null}),
		false
	);
});

test('supervisors see an employee’s documents when they share a location', () => {
	assert.equal(
		canViewStaffDocument(supervisorAtMaple, {location: null, employeeId: EMPLOYEE, employeeLocations: [OAK, MAPLE]}),
		true
	);
	assert.equal(
		canViewStaffDocument(supervisorAtMaple, {location: null, employeeId: EMPLOYEE, employeeLocations: [OAK]}),
		false
	);
});

test('an employee with no locations is admin-only', () => {
	for (const employeeLocations of [[], null]) {
		assert.equal(
			canViewStaffDocument(supervisorAtMaple, {location: null, employeeId: EMPLOYEE, employeeLocations}),
			false
		);
	}
});

test('a supervisor with no locations sees nothing', () => {
	const unassigned = {role: 'supervisor', locations: []};
	assert.equal(
		canViewStaffDocument(unassigned, {location: MAPLE, employeeId: null, employeeLocations: null}),
		false
	);
	assert.equal(
		canViewStaffDocument(unassigned, {location: null, employeeId: EMPLOYEE, employeeLocations: [MAPLE]}),
		false
	);
});
