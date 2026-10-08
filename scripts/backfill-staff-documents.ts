/**
 * One-time copy of the old per-employee HR uploads into staff_documents.
 *
 * Before the Staff Documents library, the employee HR page stored three S3
 * keys directly on `employees` (tb_test_file_id, background_check_file_id,
 * application_form_file_id). Those files were reachable only by admins. This
 * script files each one into staff_documents under that employee so
 * privileged supervisors can download them for inspectors too.
 *
 *   node --env-file=.env.local --import tsx scripts/backfill-staff-documents.ts          # dry run
 *   node --env-file=.env.local --import tsx scripts/backfill-staff-documents.ts --apply  # write
 *
 * - The S3 objects are reused, not copied: the new row points at the same key.
 * - Size and content type come from S3 (HeadObject). Keys whose object is
 *   missing are reported and skipped rather than filed as a broken download.
 * - Idempotent: a key already present in staff_documents is skipped.
 * - The old employees columns are left untouched (nothing reads them for
 *   access any more; they can be dropped in a later migration).
 *
 * Uses `pg` directly, like scripts/water-temperature-rollout-check.ts.
 */

import {Pool} from 'pg';
import {HeadObjectCommand, S3Client} from '@aws-sdk/client-s3';

const APPLY = process.argv.includes('--apply');

const SOURCES = [
	{column: 'tb_test_file_id', category: 'tb_test', title: 'TB Test'},
	{column: 'background_check_file_id', category: 'background_check', title: 'Background Check'},
	{column: 'application_form_file_id', category: 'job_application', title: 'Job Application'},
] as const;

// generateFileKey(): `${prefix}/${Date.now()}-${random}-${sanitizedName}`
function parseKey(key: string) {
	const base = key.split('/').pop() || key;
	const match = /^(\d{13})-[a-z0-9]+-(.+)$/.exec(base);
	return {
		fileName: match ? match[2] : base,
		uploadedAt: match ? new Date(Number(match[1])) : null,
	};
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('DATABASE_URL is not set');

	const s3 = new S3Client({
		region: process.env.AWS_REGION!,
		endpoint: process.env.AWS_ENDPOINT_URL!,
		credentials: {
			accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
		},
	});
	const bucket = process.env.AWS_S3_BUCKET_NAME!;
	const pool = new Pool({connectionString: databaseUrl});

	let filed = 0;
	let skipped = 0;
	let missing = 0;

	try {
		const {rows: existing} = await pool.query<{file_storage_id: string}>(
			'SELECT file_storage_id FROM staff_documents'
		);
		const alreadyFiled = new Set(existing.map((row) => row.file_storage_id));

		for (const source of SOURCES) {
			const {rows} = await pool.query<{id: string; name: string; key: string}>(
				`SELECT id, name, ${source.column} AS key FROM employees
				 WHERE ${source.column} IS NOT NULL AND ${source.column} <> ''`
			);

			for (const row of rows) {
				if (alreadyFiled.has(row.key)) {
					skipped++;
					continue;
				}

				let head;
				try {
					head = await s3.send(new HeadObjectCommand({Bucket: bucket, Key: row.key}));
				} catch {
					missing++;
					console.warn(`MISSING  ${source.title} for employee ${row.id}: object not found in bucket`);
					continue;
				}

				const {fileName, uploadedAt} = parseKey(row.key);
				console.log(`${APPLY ? 'FILE    ' : 'WOULD   '} ${source.title} for employee ${row.id} (${fileName})`);

				if (APPLY) {
					await pool.query(
						`INSERT INTO staff_documents
						   (category, employee_id, title, file_storage_id, file_name, file_size,
						    content_type, uploaded_by, uploaded_at)
						 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()))`,
						[
							source.category,
							row.id,
							source.title,
							row.key,
							fileName.slice(0, 255),
							head.ContentLength ?? 0,
							head.ContentType || 'application/octet-stream',
							`backfill:employees.${source.column}`,
							uploadedAt,
						]
					);
					alreadyFiled.add(row.key);
				}
				filed++;
			}
		}
	} finally {
		await pool.end();
	}

	console.log(
		`\n${APPLY ? 'Filed' : 'Would file'} ${filed}, already filed ${skipped}, missing in bucket ${missing}.` +
			(APPLY ? '' : '\nDry run only — re-run with --apply to write.')
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
