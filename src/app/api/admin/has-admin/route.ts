import {NextResponse} from 'next/server';
import {checkForAdmins} from '@/db/queries/roles';

export async function GET() {
	try {
		const admins = await checkForAdmins();
		const hasAdmin = admins.length > 0;

		console.log('🔍 hasAdminUser:', hasAdmin);
		return NextResponse.json({hasAdmin});
	} catch (error) {
		console.error('Error checking for admin:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
