import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {acknowledgeIsp} from '@/db/mutations/care';

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const {residentId, ispId} = await req.json();

		if (!residentId || !ispId) {
			return new NextResponse('Resident ID and ISP ID are required', {
				status: 400,
			});
		}

		await acknowledgeIsp(userId, residentId, ispId);
		return NextResponse.json({success: true}, {status: 200});
	} catch (error: any) {
		console.error('Error acknowledging ISP:', error);
		return new NextResponse(error.message, {status: 500});
	}
}
