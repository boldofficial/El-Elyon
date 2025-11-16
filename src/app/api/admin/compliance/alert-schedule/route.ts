import {NextRequest, NextResponse} from 'next/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {upsertConfig} from '@/db/mutations/config';
import {auth} from '@clerk/nextjs/server';

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		await requireAdminAccess(userId);

		const {weekday, hour, minute} = await req.json();

		if (
			typeof weekday !== 'number' ||
			typeof hour !== 'number' ||
			typeof minute !== 'number'
		) {
			return NextResponse.json(
				{error: 'Invalid input for schedule'},
				{status: 400}
			);
		}

		const updatedConfig = await upsertConfig({
			alertWeekday: weekday,
			alertHour: hour,
			alertMinute: minute,
		});

		await logAudit({
			clerkUserId: userId,
			event: 'Compliance Alert Schedule Updated',
			details: `Weekday: ${weekday}, Hour: ${hour}, Minute: ${minute}`,
			deviceId: 'server', // Placeholder, as deviceId is not available in API route
			location: 'server', // Placeholder, as location is not available in API route
		});

		return NextResponse.json({success: true, config: updatedConfig});
	} catch (error: any) {
		console.error('Error setting compliance alert schedule:', error);
		return NextResponse.json(
			{error: error.message || 'Failed to set compliance alert schedule'},
			{status: 500}
		);
	}
}
