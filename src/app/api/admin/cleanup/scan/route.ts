import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess} from '@/lib/db-helpers';
import {scanAllOrphanedData} from '@/db/queries/cleanup';

/**
 * GET /api/admin/cleanup/scan
 * Scans the database for orphaned records across all tables
 * @returns ScanResults with counts and details of orphaned records
 */
export async function GET() {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		await requireAdminAccess(userId);

		const results = await scanAllOrphanedData();

		return NextResponse.json(results);
	} catch (error: any) {
		console.error('Error scanning for orphaned data:', error);
		return NextResponse.json(
			{error: error.message || 'Failed to scan for orphaned data'},
			{status: 500}
		);
	}
}
