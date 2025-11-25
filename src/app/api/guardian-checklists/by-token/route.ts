// =================================
// Get guardian checklist by token API
// ====================================
import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {
	guardianChecklistLinks,
	guardianChecklistTemplates,
	residents,
} from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		const token = req.nextUrl.searchParams.get('token');

		if (!token) {
			return NextResponse.json({error: 'Token required'}, {status: 400});
		}

		const link = await db.query.guardianChecklistLinks.findFirst({
			where: eq(guardianChecklistLinks.token, token),
		});

		if (!link) {
			return NextResponse.json({link: null, template: null});
		}

		const template = await db.query.guardianChecklistTemplates.findFirst({
			where: eq(guardianChecklistTemplates.id, link.templateId),
		});

		const resident = await db.query.residents.findFirst({
			where: eq(residents.id, link.residentId),
		});

		const expired = link.expiresAt < new Date();

		return NextResponse.json({
			link,
			template,
			residentName: resident?.name || 'Unknown',
			expired,
		});
	} catch (error) {
		console.error('Error getting checklist:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
