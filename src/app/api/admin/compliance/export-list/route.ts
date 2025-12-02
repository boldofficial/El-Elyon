// import {NextRequest, NextResponse} from 'next/server';
// import {auth} from '@clerk/nextjs/server';
// import {exportComplianceList} from '@/db/mutations/compliance';

// export async function POST(req: NextRequest) {
// 	try {
// 		const {userId} = await auth();
// 		if (!userId) {
// 			return new NextResponse('Unauthorized', {status: 401});
// 		}

// 		const {itemIds} = await req.json();

// 		if (!itemIds || !Array.isArray(itemIds)) {
// 			return new NextResponse('itemIds (array of strings) is required', {
// 				status: 400,
// 			});
// 		}

// 		const result = await exportComplianceList(userId, itemIds);
// 		return NextResponse.json(result, {status: 200});
// 	} catch (error: any) {
// 		console.error('Error exporting compliance list:', error);
// 		return new NextResponse(error.message, {status: 500});
// 	}
// }

// src/app/api/admin/compliance/export-list/route.ts

import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {exportComplianceList} from '@/db/mutations/compliance';

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const {itemIds} = await req.json();

		if (!itemIds || !Array.isArray(itemIds)) {
			return NextResponse.json(
				{error: 'itemIds (array of strings) is required'},
				{status: 400}
			);
		}

		const result = await exportComplianceList(userId, itemIds);

		// Return CSV file as downloadable response
		return new NextResponse(result.csvData, {
			status: 200,
			headers: {
				'Content-Type': 'text/csv',
				'Content-Disposition': `attachment; filename="${result.filename}"`,
			},
		});
	} catch (error: any) {
		console.error('Error exporting compliance list:', error);
		return NextResponse.json(
			{error: error.message || 'Failed to export compliance list'},
			{status: 500}
		);
	}
}
