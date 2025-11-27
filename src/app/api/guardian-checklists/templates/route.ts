// src/app/api/guardian-checklists/templates/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {
	listChecklistTemplates,
	getChecklistTemplate,
} from '@/db/queries/guardian-checklists';
import {
	createChecklistTemplate,
	updateChecklistTemplate,
	deleteChecklistTemplate,
} from '@/db/mutations/guardian-checklists';

// GET - List all templates
export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const activeOnly = req.nextUrl.searchParams.get('activeOnly') === 'true';
		const templates = await listChecklistTemplates(activeOnly);

		return NextResponse.json(templates);
	} catch (error: any) {
		console.error('Error listing templates:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// POST - Create new template
export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const body = await req.json();
		const {name, description, questions} = body;

		if (!name || !questions || !Array.isArray(questions)) {
			return NextResponse.json(
				{error: 'Name and questions are required'},
				{status: 400}
			);
		}

		const template = await createChecklistTemplate(userId, {
			name,
			description,
			questions,
		});

		return NextResponse.json(template, {status: 201});
	} catch (error: any) {
		console.error('Error creating template:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
