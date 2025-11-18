// src/app/api/guardian-checklists/submit/route.ts

import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {guardianChecklistLinks} from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function POST(req: Request) {
	try {
		const {token, responses} = await req.json();

		const link = await db.query.guardianChecklistLinks.findFirst({
			where: eq(guardianChecklistLinks.token, token),
		});

		if (!link) {
			return NextResponse.json({error: 'Invalid token'}, {status: 404});
		}

		if (link.completed) {
			return NextResponse.json(
				{error: 'Checklist already completed'},
				{status: 400}
			);
		}

		if (link.expiresAt < new Date()) {
			return NextResponse.json({error: 'Checklist expired'}, {status: 400});
		}

		await db
			.update(guardianChecklistLinks)
			.set({
				completed: true,
				completedAt: new Date(),
				responses,
			})
			.where(eq(guardianChecklistLinks.id, link.id));

		return NextResponse.json({success: true});
	} catch (error) {
		console.error('Error submitting checklist:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
