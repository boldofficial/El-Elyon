// ====================================
// Get app settings API
// ===================================
import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {internalServerError} from '@/lib/api-errors';
import {db} from '@/db/index';
import {config} from '@/db/schema';
import {upsertConfig} from '@/db/mutations/config';
import {requireAdminOrPrivilege, logAudit} from '@/lib/db-helpers';

export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const settings = await db.query.config.findFirst();
		return NextResponse.json(settings || {});
	} catch (error) {
		return internalServerError(error, 'GetAppSettings');
	}
}

export async function PATCH(request: Request) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminOrPrivilege(userId, 'manage_settings');

        const body = await request.json();
        const {
            complianceReminderTemplate,
            guardianInviteTemplate,
            alertWeekday,
            alertHour,
            alertMinute,
            selfieEnforced,
        } = body;

        const updatedSettings = await upsertConfig({
            complianceReminderTemplate,
            guardianInviteTemplate,
            alertWeekday,
            alertHour,
            alertMinute,
            selfieEnforced,
        });

        await logAudit({
            clerkUserId: userId,
            event: 'UPDATE_APP_SETTINGS_SUCCESS',
            details: `App settings updated.`,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json(updatedSettings);
    } catch (error) {
        return internalServerError(error, 'UpdateAppSettings');
    }
}
