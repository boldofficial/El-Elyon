// ===================================
// Get all locations
// ====================================
import {NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {db} from '@/db';

export async function GET() {
	try {
		await requireRole(['admin']);

		const locations = await db.query.locations.findMany();
		return NextResponse.json(locations);
	} catch (error) {
		console.error('Error getting locations:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
