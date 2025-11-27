// src/app/api/files/list/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {listFiles} from '@/lib/neon-storage';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const searchParams = req.nextUrl.searchParams;
		const category = searchParams.get('category') || undefined;
		const limit = parseInt(searchParams.get('limit') || '50');
		const offset = parseInt(searchParams.get('offset') || '0');

		const files = await listFiles({
			category,
			limit,
			offset,
		});

		return NextResponse.json(files);
	} catch (error: any) {
		console.error('Error listing files:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
