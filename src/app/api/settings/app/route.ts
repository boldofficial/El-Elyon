// ====================================
// Get app settings API
// ===================================
import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db';
import {config} from '@/db/schema';

export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const settings = await db.query.config.findFirst();
		return NextResponse.json(settings || {});
	} catch (error) {
		console.error('Error getting app settings:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
