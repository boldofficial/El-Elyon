import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {requireAdminAccess} from '@/lib/db-helpers';
import {
	getAllAdminPrivileges,
	listDelegatableUsersWithPrivileges,
} from '@/db/queries/admin-privileges';
import {ADMIN_PRIVILEGE_LABELS} from '@/lib/admin-privileges';

export async function GET() {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		return NextResponse.json({
			privileges: getAllAdminPrivileges().map((privilege) => ({
				key: privilege,
				label: ADMIN_PRIVILEGE_LABELS[privilege],
			})),
			users: await listDelegatableUsersWithPrivileges(),
		});
	} catch (error: any) {
		console.error('Error listing admin privileges:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
