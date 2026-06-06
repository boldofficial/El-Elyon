import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminOrPrivilege} from '@/lib/db-helpers';
import {cleanupOrphanedDataByCategories} from '@/db/mutations/cleanup';

/**
 * POST /api/admin/cleanup/run
 * Deletes orphaned records for specified categories
 * @body {categories: string[]} - Array of category names to clean up
 * @returns CleanupResult with deletion counts and affected record IDs
 */
export async function POST(req: NextRequest) {
	try {
		// Authenticate user
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		// Require admin access
		await requireAdminOrPrivilege(userId, 'manage_data_cleanup');

		// Parse request body
		const {categories} = await req.json();

		// Validate input
		if (!Array.isArray(categories)) {
			return NextResponse.json(
				{error: 'Invalid input: categories must be an array'},
				{status: 400}
			);
		}

		if (categories.length === 0) {
			return NextResponse.json(
				{error: 'No categories specified for cleanup'},
				{status: 400}
			);
		}

		// Execute cleanup
		const result = await cleanupOrphanedDataByCategories(userId, categories);

		return NextResponse.json(result);
	} catch (error: any) {
		console.error('Error running data cleanup:', error);
		return NextResponse.json(
			{error: error.message || 'Failed to run data cleanup'},
			{status: 500}
		);
	}
}
