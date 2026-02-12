import {auth, currentUser} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {requireCareAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {fireDrills} from '@/db/schema';
import {and, asc, eq, inArray} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) return NextResponse.json({error: 'Not authenticated'}, {status: 401});

		const role = await requireCareAccess(userId);
		const searchParams = req.nextUrl.searchParams;
		const locationParam = searchParams.get('location');
		const year = searchParams.get('year');
		const sequence = searchParams.get('sequence'); // optional filter 1/2
		const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);

		const conditions: any[] = [];
		const scopedLocations = role.locations || [];

		if (locationParam && locationParam !== 'all') {
			conditions.push(eq(fireDrills.location, locationParam));
		} else if (scopedLocations.length > 0 && role.role !== 'admin') {
			conditions.push(inArray(fireDrills.location, scopedLocations));
		}
		if (year) {
			conditions.push(eq(fireDrills.year, parseInt(year, 10)));
		}
		if (sequence) {
			conditions.push(eq(fireDrills.sequence, parseInt(sequence, 10)));
		}

		const rows = await db.query.fireDrills.findMany({
			where: conditions.length > 0 ? (drill, {and}) => and(...conditions) : undefined,
			orderBy: [asc(fireDrills.year), asc(fireDrills.sequence), asc(fireDrills.date)],
			limit,
		});

		return NextResponse.json(rows);
	} catch (error) {
		if (error instanceof Error && error.message.toLowerCase().includes('access')) {
			return NextResponse.json({error: error.message}, {status: 403});
		}
		console.error('Error fetching fire drills:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) return NextResponse.json({error: 'Not authenticated'}, {status: 401});

		const role = await requireCareAccess(userId);
		const body = await req.json();

		if (!body.location || !body.year || !body.sequence || !body.residentName) {
			return NextResponse.json({error: 'Missing required fields'}, {status: 400});
		}

		if (role.role !== 'admin' && role.locations && !role.locations.includes(body.location)) {
			return NextResponse.json({error: 'Location not allowed'}, {status: 403});
		}

		// Auto-populate date and time with current timestamp
		const currentDate = new Date();
		const currentTime = currentDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

		// Auto-populate staff name from Clerk user
		const user = await currentUser();
		const staffName = user?.firstName && user?.lastName 
			? `${user.firstName} ${user.lastName}`
			: user?.firstName || user?.lastName || user?.emailAddresses?.[0]?.emailAddress || 'Unknown Staff';

		const [inserted] = await db
			.insert(fireDrills)
			.values({
				location: body.location,
				year: parseInt(body.year, 10),
				sequence: parseInt(body.sequence, 10),
				residentName: body.residentName,
				date: currentDate,
				time: currentTime,
				staffName: staffName,
				comment: body.comment,
				createdBy: userId,
			})
			.returning();

		return NextResponse.json(inserted, {status: 201});
	} catch (error) {
		console.error('Error creating fire drill:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
