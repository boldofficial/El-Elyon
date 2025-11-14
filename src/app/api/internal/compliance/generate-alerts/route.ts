import {NextRequest, NextResponse} from 'next/server';
import {
	internalListResidents,
	internalListResidentISPFiles,
	internalListLatestFireEvac,
	internalListAlertsForLocation,
} from '@/db/queries/compliance';
import {internalCreateAlert} from '@/db/mutations/compliance';

// This route is intended to be called by an internal scheduler (e.g., cron job)
// and does not require direct user authentication.
export async function POST(req: NextRequest) {
	// TODO: Implement a secure way to authenticate internal calls (e.g., API key)
	// For now, it's open, but in production, this needs to be secured.
	console.log('Triggered internal compliance alert generation.');

	try {
		const residentsList = await internalListResidents();
		for (const resident of residentsList) {
			const ispFiles = await internalListResidentISPFiles(resident.id);
			const activeISP = ispFiles.find((f) => f.status === 'active');
			if (activeISP) {
				const dueAt = activeISP.effectiveDate.getTime() + 6 * 30 * 24 * 60 * 60 * 1000;
				if (dueAt - Date.now() <= 1000 * 60 * 60 * 24 * 30) {
					const alerts = await internalListAlertsForLocation(resident.location, 'isp');
					const alreadyActive = alerts.some(
						(a) => a.active && a.type === 'isp' // Check for active ISP alert
					);
					if (!alreadyActive) {
						await internalCreateAlert(
							'isp',
							resident.location,
							dueAt, // Still pass dueAt for logging/context, but not for schema
							`ISP due soon for resident(s) at ${resident.location}`
						);
					}
				}
			}
		}

		// Fire Evac alerts - now per resident
		const fireEvacs = await internalListLatestFireEvac();
		for (const fe of fireEvacs) {
			const location = fe.location || 'unknown';
			const dueAt = (fe.createdAt?.getTime() || Date.now()) + 365 * 24 * 60 * 60 * 1000;
			if (dueAt - Date.now() <= 1000 * 60 * 60 * 24 * 30) {
				const alerts = await internalListAlertsForLocation(location, 'fire_evac');
				const alreadyActive = alerts.some(
					(a) => a.active && a.type === 'fire_evac' // Check for active Fire Evac alert
				);
				if (!alreadyActive) {
					await internalCreateAlert(
						'fire_evac',
						location,
						dueAt, // Still pass dueAt for logging/context, but not for schema
						`Fire Evac plan due soon for ${fe.residentName}`
					);
				}
			}
		}
		return NextResponse.json({success: true}, {status: 200});
	} catch (error: any) {
		console.error('Error generating compliance alerts:', error);
		return new NextResponse(error.message, {status: 500});
	}
}
