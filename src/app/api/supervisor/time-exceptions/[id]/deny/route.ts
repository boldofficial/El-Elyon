import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireSupervisorAccess, logAudit} from '@/lib/db-helpers';

export async function POST(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireSupervisorAccess(userId);

		const {id: exceptionId} = await params;
		if (!exceptionId) {
			return NextResponse.json(
				{error: 'Exception ID is required'},
				{status: 400}
			);
		}

		const body = await request.json();
		const {reason} = body;

		// Placeholder: Implementation would update shift record with denial
		console.log(
			`Denying time exception: ${exceptionId} with reason: ${reason}`
		);

		await logAudit({
			clerkUserId: userId,
			event: 'DENY_TIME_EXCEPTION_SUCCESS',
			details: `Time exception ${exceptionId} denied. Reason: ${reason}.`,
			deviceId: 'system', // Placeholder
			location: '', // Placeholder
		});
		return NextResponse.json(
			{message: 'Time exception denied successfully'},
			{status: 200}
		);
	} catch (error: any) {
		await logAudit({
			clerkUserId: userId,
			event: 'DENY_TIME_EXCEPTION_FAILED',
			details: error.message,
			deviceId: 'system', // Placeholder
			location: '', // Placeholder
		});
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
