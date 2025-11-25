import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residentLogs} from '@/db/schema';

export async function POST(req: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const {residentId, template, content} = await req.json();

		const [log] = await db
			.insert(residentLogs)
			.values({
				residentId,
				template,
				content,
				authorId: userId,
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
