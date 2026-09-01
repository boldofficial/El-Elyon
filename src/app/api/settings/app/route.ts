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
import {organizationTimeZoneSchema} from '@/lib/water-temperature';

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
            operationalTimeZone,
        } = body;

        // R2/KTD2: the operational timezone is the single canonical setting
        // used to freeze water-temperature/shift operational dates. Validate
        // it as an IANA timezone here (not just at the DB check-constraint
        // level, which only rejects blank strings) so a malformed admin edit
        // fails visibly instead of silently breaking future clock-ins. It is
        // only ever set here, in the admin settings contract -- never as a
        // care-user clock-in choice.
        let validatedOperationalTimeZone: string | undefined;
        if (operationalTimeZone !== undefined) {
            const parsed = organizationTimeZoneSchema.safeParse(operationalTimeZone);
            if (!parsed.success) {
                return NextResponse.json(
                    {error: parsed.error.issues[0]?.message || 'Invalid time zone'},
                    {status: 400}
                );
            }
            validatedOperationalTimeZone = parsed.data;
        }

        const updatedSettings = await upsertConfig({
            complianceReminderTemplate,
            guardianInviteTemplate,
            alertWeekday,
            alertHour,
            alertMinute,
            selfieEnforced,
            ...(validatedOperationalTimeZone !== undefined
                ? {operationalTimeZone: validatedOperationalTimeZone}
                : {}),
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
