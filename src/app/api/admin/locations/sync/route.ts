// ====================================
// Sync locations from string array
// ====================================
import {NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {db} from '@/db';
import {locations} from '@/db/schema';

export async function POST(req: Request) {
	try {
		const user = await requireRole(['admin']);
		const {locationNames} = await req.json();

		console.log('🏢 Syncing locations:', locationNames);

		const existingLocations = await db.query.locations.findMany();
		const existingNames = new Set(existingLocations.map((l) => l.name));

		let created = 0;
		for (const name of locationNames) {
			if (!existingNames.has(name)) {
				await db.insert(locations).values({
					name,
					status: 'active',
					createdBy: user.clerkUserId,
					createdAt: new Date(),
				});
				console.log(`✅ Created location: ${name}`);
				created++;
			}
		}

		console.log(
			`🎉 Location sync complete! Created: ${created}, Existing: ${existingNames.size}`
		);

		return NextResponse.json({
			success: true,
			created,
			existing: existingNames.size,
		});
	} catch (error) {
		console.error('Error syncing locations:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
