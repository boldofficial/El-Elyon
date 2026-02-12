import {auth, currentUser} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {requireCareAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {smokeDetectorChecks} from '@/db/schema';
import {and, desc, eq, gte, inArray, lte} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) return NextResponse.json({error: 'Not authenticated'}, {status: 401});

		const role = await requireCareAccess(userId);
		const searchParams = req.nextUrl.searchParams;
		const locationParam = searchParams.get('location');
		const year = searchParams.get('year');
		const month = searchParams.get('month'); // 1-12
		const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);

		const conditions: any[] = [];
		const scopedLocations = role.locations || [];

		if (locationParam && locationParam !== 'all') {
			conditions.push(eq(smokeDetectorChecks.location, locationParam));
		} else if (scopedLocations.length > 0 && role.role !== 'admin') {
			conditions.push(inArray(smokeDetectorChecks.location, scopedLocations));
		}

		if (year) {
			const y = parseInt(year, 10);
			const start = new Date(Date.UTC(y, month ? parseInt(month, 10) - 1 : 0, 1));
			const end = month
				? new Date(Date.UTC(y, parseInt(month, 10), 0, 23, 59, 59, 999))
				: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
			conditions.push(gte(smokeDetectorChecks.date, start));
			conditions.push(lte(smokeDetectorChecks.date, end));
		}

		const rows = await db.query.smokeDetectorChecks.findMany({
			where: conditions.length > 0 ? (smokeDetectorChecks, {and}) => and(...conditions) : undefined,
			orderBy: [desc(smokeDetectorChecks.date)],
			limit,
		});

		return NextResponse.json(rows);
	} catch (error) {
		if (error instanceof Error && error.message.toLowerCase().includes('access')) {
			return NextResponse.json({error: error.message}, {status: 403});
		}
		console.error('Error fetching smoke detector checks:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) return NextResponse.json({error: 'Not authenticated'}, {status: 401});

		const role = await requireCareAccess(userId);
		const body = await req.json();

		if (!body.location || !body.smokeStatus || !body.coStatus) {
			return NextResponse.json({error: 'Missing required fields'}, {status: 400});
		}

		if (role.role !== 'admin' && role.locations && !role.locations.includes(body.location)) {
			return NextResponse.json({error: 'Location not allowed'}, {status: 403});
		}

		// Auto-populate date with current timestamp
		const currentDate = new Date();

		// Auto-populate staff initials from Clerk user's name
		const user = await currentUser();
		const fullName = user?.firstName && user?.lastName 
			? `${user.firstName} ${user.lastName}`
			: user?.firstName || user?.lastName || user?.emailAddresses?.[0]?.emailAddress || 'Unknown';
		const staffInitials = fullName
			.split(' ')
			.map((n: string) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 3); // Limit to 3 characters

		const [inserted] = await db
			.insert(smokeDetectorChecks)
			.values({
				location: body.location,
				date: currentDate,
				smokeStatus: body.smokeStatus,
				coStatus: body.coStatus,
				staffInitials: staffInitials,
				notes: body.notes,
				createdBy: userId,
			})
			.returning();

		return NextResponse.json(inserted, {status: 201});
	} catch (error) {
		console.error('Error creating smoke detector check:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
