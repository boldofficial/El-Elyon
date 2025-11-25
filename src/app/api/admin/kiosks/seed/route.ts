// ====================================
// Seed kiosk devices for all locations
// ====================================
import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {db} from '@/db/index';
import {kiosks} from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function POST() {
	try {
		const user = await requireRole(['admin']);

		console.log('🏢 Seeding kiosk devices for all locations...');

		const locations = [
			'Rose of sharon',
			'Meta B',
			'Meta A',
			'Meta C',
			'Meta D',
			'Meta E',
			'Bread of Live',
		];

		const createdDevices = [];
		const skippedDevices = [];

		for (const location of locations) {
			// Check if device already exists for this location
			const existing = await db.query.kiosks.findFirst({
				where: eq(kiosks.location, location),
			});

			if (existing) {
				console.log(`⏭️  Device already exists for ${location}, skipping...`);
				skippedDevices.push(location);
				continue;
			}

			// Generate unique device ID
			const deviceId = `kiosk_${location.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString(36)}`;

			const [kioskRecord] = await db
				.insert(kiosks)
				.values({
					name: `${location} Kiosk`,
					location: location,
					deviceId: deviceId,
					deviceLabel: `${location} - Front Desk Laptop`,
					status: 'active',
					active: true,
					registeredAt: new Date(),
					registeredBy: user.clerkUserId,
					createdAt: new Date(),
					createdBy: user.clerkUserId,
				})
				.returning();

			createdDevices.push({
				kioskId: kioskRecord.id,
				location,
				deviceId,
			});

			console.log(`✅ Created kiosk for ${location}: ${deviceId}`);
		}

		console.log(
			`🎉 Seeding complete! Created: ${createdDevices.length}, Skipped: ${skippedDevices.length}`
		);

		return NextResponse.json({
			success: true,
			message: `Created ${createdDevices.length} kiosk device(s). Skipped ${skippedDevices.length} existing.`,
			created: createdDevices,
			skipped: skippedDevices,
		});
	} catch (error) {
		console.error('Error seeding kiosks:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
