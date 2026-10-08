/**
 * DB-free tests for the /api/uploads authorization rules.
 *
 * db/index is replaced with a stub whose tables return whatever owning rows a
 * test sets up, so the allow/deny decision and the audit trail are verified on
 * every plain `node --test` run.
 *
 * Run with --experimental-test-module-mocks (see the test:care-access script).
 */
import assert from 'node:assert/strict';
import test, {before, beforeEach, mock} from 'node:test';

const LOCATION_A = 'Location A';
const LOCATION_B = 'Location B';
const RESIDENT_A = '5a000000-0000-4000-8000-00000000000a';
const RESIDENT_B = '5a000000-0000-4000-8000-00000000000b';
const CALLER = 'clerk-user-under-test';
const KEY = 'resident-documents/1700000000000-abc-care-plan.pdf';

type Rows = Array<Record<string, unknown>>;
const TABLES = [
    'residentDocuments',
    'ispFiles',
    'fireEvac',
    'incidentReports',
    'employees',
    'hrFiles',
    'employeeTrainings',
] as const;

let owners: Record<(typeof TABLES)[number], Rows>;
let residentLocations: Record<string, string>;
let residentLookups: string[];
let auditRows: Rows;
let lookups: number;
let upload: typeof import('./upload-access');

const staff = {role: 'staff', locations: [LOCATION_A]};
const supervisor = {role: 'supervisor', locations: [LOCATION_A]};
const admin = {role: 'admin', locations: []};

before(async () => {
    const query: Record<string, unknown> = Object.fromEntries(
        TABLES.map((table) => [
            table,
            {
                findMany: async () => {
                    lookups++;
                    return owners[table];
                },
            },
        ])
    );
    // residentInScope looks up one resident per call. The stub cannot read
    // drizzle's where clause, so it answers in the order owners were added.
    query.residents = {
        findFirst: async () => {
            const id = residentLookups.shift();
            return id ? {location: residentLocations[id]} : undefined;
        },
    };

    mock.module('../db/index', {
        namedExports: {
            db: {
                query,
                insert: () => ({
                    values: async (row: Record<string, unknown>) => {
                        auditRows.push(row);
                    },
                }),
            },
        },
    });

    upload = await import('./upload-access');
});

function reset() {
    owners = Object.fromEntries(TABLES.map((table) => [table, []])) as unknown as typeof owners;
    residentLocations = {};
    residentLookups = [];
    auditRows = [];
    lookups = 0;
}

beforeEach(reset);

function ownedByResident(table: (typeof TABLES)[number], residentId: string, location: string) {
    owners[table].push({residentId});
    if (!(residentId in residentLocations)) residentLookups.push(residentId);
    residentLocations[residentId] = location;
}

const read = (userRole: {role: string; locations: string[]} | null, fileKey = KEY) =>
    upload.canReadUpload({clerkUserId: CALLER, userRole, fileKey});

test('staff may read a resident document in their own location', async () => {
    ownedByResident('residentDocuments', RESIDENT_A, LOCATION_A);

    assert.equal(await read(staff), true);
    assert.deepEqual(auditRows, [], 'an allowed read must not be audited as a denial');
});

test('staff reading an ISP file from another location is denied and audited', async () => {
    ownedByResident('ispFiles', RESIDENT_B, LOCATION_B);

    assert.equal(await read(staff), false);
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].event, 'access_denied');
    assert.equal(auditRows[0].details, `uploads_read_cross_location_${RESIDENT_B}`);
});

test('incident attachments and fire-evac plans follow the resident location rule', async () => {
    for (const table of ['incidentReports', 'fireEvac'] as const) {
        reset();
        ownedByResident(table, RESIDENT_A, LOCATION_A);
        assert.equal(await read(staff), true, `${table} in scope`);

        reset();
        ownedByResident(table, RESIDENT_B, LOCATION_B);
        assert.equal(await read(staff), false, `${table} out of scope`);
    }
});

test('a key linked to two residents needs both in scope', async () => {
    ownedByResident('residentDocuments', RESIDENT_A, LOCATION_A);
    ownedByResident('ispFiles', RESIDENT_B, LOCATION_B);

    assert.equal(await read(staff), false, 'an in-scope link must not unlock an out-of-scope one');
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].details, `uploads_read_cross_location_${RESIDENT_B}`);
});

test('HR and training files are refused to non-admins even with a resident link', async () => {
    for (const table of ['employees', 'hrFiles', 'employeeTrainings'] as const) {
        reset();
        owners[table].push({id: 'employee-row'});
        // A planted resident_documents row pointing at the same key must not
        // launder an HR file into a readable resident document.
        ownedByResident('residentDocuments', RESIDENT_A, LOCATION_A);

        assert.equal(await read(supervisor), false, table);
        assert.equal(auditRows.length, 1, `${table} denial is audited`);
        assert.match(String(auditRows[0].details), /^uploads_read_(employee_hr|hr_file|training_certificate)_/);
    }
});

test('a key with no owning row is refused rather than reported missing', async () => {
    assert.equal(await read(staff), false);
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].details, `uploads_read_unreferenced_${KEY}`);
});

test('a caller with no care role is refused before any key lookup', async () => {
    for (const userRole of [null, {role: 'guardian', locations: [LOCATION_A]}]) {
        reset();
        ownedByResident('residentDocuments', RESIDENT_A, LOCATION_A);

        assert.equal(await read(userRole), false);
        assert.equal(lookups, 0);
        assert.equal(auditRows.length, 1);
    }
});

test('admins may read any key, including one not yet saved to a row', async () => {
    assert.equal(await read(admin), true);
    assert.equal(lookups, 0, 'admin reads skip the owner lookup');
    assert.deepEqual(auditRows, []);
});

test('staff-documents keys are refused to everyone, admins included', async () => {
    for (const userRole of [admin, supervisor, staff]) {
        reset();
        assert.equal(await read(userRole, 'staff-documents/1700000000000-abc-tb.pdf'), false);
        assert.equal(auditRows.length, 1);
        assert.match(String(auditRows[0].details), /^uploads_read_staff_document_/);
    }
});

test('upload prefixes are limited to the roles that store them', () => {
    assert.equal(upload.canUploadAs('staff', 'incident-attachments'), true);
    assert.equal(upload.canUploadAs('staff', 'resident-documents'), true);
    assert.equal(upload.canUploadAs('staff', 'isp-files'), false);
    assert.equal(upload.canUploadAs('supervisor', 'isp-files'), true);
    assert.equal(upload.canUploadAs('staff', 'fire-evac'), true);
    assert.equal(upload.canUploadAs('supervisor', 'tb_test'), false);
    assert.equal(upload.canUploadAs('Admin', 'training_certificates'), true);

    for (const fileType of ['staff-documents', 'general', '', '../hr', '__proto__', 'constructor']) {
        assert.equal(upload.canUploadAs('admin', fileType), false, `refuses '${fileType}'`);
    }
});
