/**
 * DB-free tests for residentInScope.
 *
 * The care-access integration tests cover the same ground end-to-end, but they
 * need a throwaway Neon database and are skipped without one. These do not:
 * db/index is replaced with a stub, so the deny/allow decision and the audit
 * trail are verified on every plain `node --test` run.
 *
 * Run with --experimental-test-module-mocks (see the test:care-access script).
 */
import assert from 'node:assert/strict';
import test, {before, beforeEach, mock} from 'node:test';

const LOCATION_A = 'Location A';
const LOCATION_B = 'Location B';
const RESIDENT = '5a000000-0000-4000-8000-000000000001';
const CALLER = 'clerk-user-under-test';

let residentRow: {location: string} | undefined;
let auditRows: Array<Record<string, unknown>>;
let residentInScope: (typeof import('./db-helpers'))['residentInScope'];

before(async () => {
    mock.module('../db/index', {
        namedExports: {
            db: {
                query: {residents: {findFirst: async () => residentRow}},
                insert: () => ({
                    values: async (row: Record<string, unknown>) => {
                        auditRows.push(row);
                    },
                }),
            },
        },
    });

    ({residentInScope} = await import('./db-helpers'));
});

beforeEach(() => {
    residentRow = undefined;
    auditRows = [];
});

test('an admin is allowed through without consulting the resident location', async () => {
    residentRow = {location: LOCATION_B};

    const allowed = await residentInScope({
        clerkUserId: CALLER,
        userRole: {role: 'admin', locations: []},
        residentId: RESIDENT,
        auditDetail: 'test',
    });

    assert.equal(allowed, true);
    assert.deepEqual(auditRows, [], 'an allowed request must not be audited as a denial');
});

test('a non-admin reaching a resident in an assigned location is allowed', async () => {
    residentRow = {location: LOCATION_A};

    const allowed = await residentInScope({
        clerkUserId: CALLER,
        userRole: {role: 'staff', locations: [LOCATION_A]},
        residentId: RESIDENT,
        auditDetail: 'test',
    });

    assert.equal(allowed, true);
    assert.deepEqual(auditRows, []);
});

test('a non-admin reaching a resident in another location is denied and audited', async () => {
    residentRow = {location: LOCATION_B};

    const allowed = await residentInScope({
        clerkUserId: CALLER,
        userRole: {role: 'staff', locations: [LOCATION_A]},
        residentId: RESIDENT,
        auditDetail: 'care_route',
    });

    assert.equal(allowed, false);
    assert.equal(auditRows.length, 1, 'the denial must leave a trail');
    assert.equal(auditRows[0].event, 'access_denied');
    assert.equal(auditRows[0].clerkUserId, CALLER);
    assert.equal(
        auditRows[0].details,
        `care_route_${RESIDENT}`,
        'the audit row must name the resident that was refused'
    );
});

test('a resident that does not exist is denied rather than reported missing', async () => {
    residentRow = undefined;

    const allowed = await residentInScope({
        clerkUserId: CALLER,
        userRole: {role: 'staff', locations: [LOCATION_A]},
        residentId: RESIDENT,
        auditDetail: 'care_route',
    });

    assert.equal(
        allowed,
        false,
        'reporting a missing resident differently would let a caller probe which ids are real'
    );
    assert.equal(auditRows.length, 1);
});

test('a non-admin with no assigned locations is denied', async () => {
    residentRow = {location: LOCATION_A};

    for (const locations of [[], null, undefined]) {
        auditRows = [];
        const allowed = await residentInScope({
            clerkUserId: CALLER,
            userRole: {role: 'staff', locations},
            residentId: RESIDENT,
            auditDetail: 'care_route',
        });

        assert.equal(allowed, false);
        assert.equal(auditRows.length, 1);
    }
});
