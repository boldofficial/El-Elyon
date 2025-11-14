import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {sendComplianceReminders} from '@/db/mutations/compliance';

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const {itemIds} = await req.json();

		if (!itemIds || !Array.isArray(itemIds)) {
			return new NextResponse('itemIds (array of strings) is required', {
				status: 400,
			});
		}

		const result = await sendComplianceReminders(userId, itemIds);
		return NextResponse.json(result, {status: 200});
	} catch (error: any) {
		console.error('Error sending compliance reminders:', error);
		return new NextResponse(error.message, {status: 500});
	}
}
