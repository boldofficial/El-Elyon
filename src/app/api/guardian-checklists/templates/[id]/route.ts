// src/app/api/guardian-checklists/templates/[id]/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {getChecklistTemplate} from '@/db/queries/guardian-checklists';
import {
	updateChecklistTemplate,
	deleteChecklistTemplate,
} from '@/db/mutations/guardian-checklists';

// GET - Get single template
export async function GET(
	req: NextRequest,
	{params}: {params: Promise<{id: string}>}
) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const {id} = await params;
		const template = await getChecklistTemplate(id);
		return NextResponse.json(template);
	} catch (error: any) {
		console.error('Error getting template:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// PATCH - Update template
export async function PATCH(
	req: NextRequest,
	{params}: {params: Promise<{id: string}>}
) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const {id} = await params;
		const body = await req.json();
		const updated = await updateChecklistTemplate(userId, id, body);

		return NextResponse.json(updated);
	} catch (error: any) {
		console.error('Error updating template:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// DELETE - Delete template (soft delete)
export async function DELETE(
	req: NextRequest,
	{params}: {params: Promise<{id: string}>}
) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const {id} = await params;
		await deleteChecklistTemplate(userId, id);
		return NextResponse.json({success: true});
	} catch (error: any) {
		console.error('Error deleting template:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
