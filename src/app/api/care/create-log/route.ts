import {auth, clerkClient} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residentLogs} from '@/db/schema';
import {requireCareAccess} from '@/lib/db-helpers';

export async function POST(req: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		await requireCareAccess(userId);

		const {residentId, template, content, location, shiftId} = await req.json();

		if (!residentId) {
			return NextResponse.json({error: 'residentId is required'}, {status: 400});
		}

		const client = await clerkClient();
		const clerkUser = await client.users.getUser(userId);
		const authorName =
			clerkUser.firstName || clerkUser.lastName
				? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ')
				: clerkUser.username || clerkUser.emailAddresses[0]?.emailAddress || 'Unknown User';

		const [log] = await db
			.insert(residentLogs)
			.values({
				residentId,
				template,
				content,
				location,
				shiftId,
				authorId: userId,
				authorName,
				createdBy: userId,
				createdAt: new Date(),
				version: 1,
			})
			.returning();

		return NextResponse.json(log);
	} catch (error) {
		console.error('Error creating log:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
