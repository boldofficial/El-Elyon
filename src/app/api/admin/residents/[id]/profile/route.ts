// ==========================================
// src/app/api/admin/residents/[id]/profile/route.ts
// ==========================================
import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminOrSupervisorAccess, logAudit} from '@/lib/db-helpers';
import {
	updateResident,
	retireResidentNotices,
	reinstateResidentNotices,
} from '@/db/mutations/residents';
import {
	INACTIVE_REASONS,
	RESIDENT_ACTIVE,
	RESIDENT_INACTIVE,
	isInactiveResident,
} from '@/lib/resident-status';
import {db} from '@/db/index';
import {residents} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {
	normalizeScheduledChecks,
	resolveGlucoseThresholds,
	validateGlucoseThresholds,
} from '@/lib/blood-glucose';

const GLUCOSE_LIMIT_FIELDS = [
	'glucoseCriticalLowMgDl',
	'glucoseTargetLowMgDl',
	'glucoseTargetHighMgDl',
	'glucoseCriticalHighMgDl',
] as const;

/**
 * Blood sugar settings from the profile form. Only keys present in the body
 * are returned, so an older client that never sends them leaves them alone.
 * Blank limits are stored as null and fall back to the facility defaults.
 */
function glucoseSettingsFromBody(
	body: Record<string, unknown>
): {error: string} | {data: Record<string, unknown>} {
	const data: Record<string, unknown> = {};
	if (typeof body.glucoseTrackingEnabled === 'boolean') {
		data.glucoseTrackingEnabled = body.glucoseTrackingEnabled;
	}
	const hasLimits = GLUCOSE_LIMIT_FIELDS.some((key) => key in body);
	if (hasLimits) {
		const limits: Record<string, number | null> = {};
		for (const key of GLUCOSE_LIMIT_FIELDS) {
			const raw = body[key];
			if (raw === undefined || raw === null || raw === '') {
				limits[key] = null;
				continue;
			}
			const n = Number(raw);
			if (!Number.isInteger(n)) {
				return {error: 'Blood sugar limits must be whole numbers (mg/dL)'};
			}
			limits[key] = n;
		}
		const error = validateGlucoseThresholds(resolveGlucoseThresholds(limits));
		if (error) return {error};
		Object.assign(data, limits);
	}
	if ('glucoseScheduledChecks' in body) {
		data.glucoseScheduledChecks = normalizeScheduledChecks(body.glucoseScheduledChecks);
	}
	if ('glucoseCareInstructions' in body) {
		const raw = body.glucoseCareInstructions;
		if (raw !== null && raw !== undefined && typeof raw !== 'string') {
			return {error: 'Blood sugar instructions must be text'};
		}
		const text = typeof raw === 'string' ? raw.trim() : '';
		if (text.length > 2000) return {error: 'Blood sugar instructions are too long'};
		data.glucoseCareInstructions = text || null;
	}
	return {data};
}

// GET - Get resident profile
export async function GET(request: Request, {params}: {params: Promise<{id: string}>}) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminOrSupervisorAccess(userId);

		const {id: residentId} = await params;
		const resident = await db.query.residents.findFirst({
			where: eq(residents.id, residentId),
		});

		if (!resident) {
			return NextResponse.json({error: 'Resident not found'}, {status: 404});
		}

		return NextResponse.json(resident);
	} catch (error: any) {
		console.error('Error fetching resident profile:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// PATCH - Update resident profile
export async function PATCH(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminOrSupervisorAccess(userId);

		const {id: residentId} = await params;
		const body = await request.json();
		const glucose = glucoseSettingsFromBody(body);
		if ('error' in glucose) {
			return NextResponse.json({error: glucose.error}, {status: 400});
		}

		// Read the status as it stands before the write, so the TRANSITION --
		// not merely the new value -- drives the side effects below. Saving an
		// unrelated field on an already-inactive resident must not re-run the
		// retirement sweep and stamp a fresh dismissedAt on alerts that were
		// closed weeks ago.
		const previous = await db.query.residents.findFirst({
			where: eq(residents.id, residentId),
			columns: {status: true, inactiveReason: true, inactiveDate: true},
		});
		if (!previous) {
			return NextResponse.json({error: 'Resident not found'}, {status: 404});
		}
		const wasInactive = isInactiveResident(previous);

		// This is a PATCH, so an absent `status` means "leave it alone", not
		// "make them active". The admin form always sends the whole resident so
		// the distinction never comes up there, but reviving a resident is now
		// a side-effecting operation and it should take an explicit request.
		const nowInactive =
			body.status === undefined
				? wasInactive
				: body.status === RESIDENT_INACTIVE;
		const status = nowInactive ? RESIDENT_INACTIVE : RESIDENT_ACTIVE;

		// A reason only survives while the resident is inactive, and only if it
		// is one the UI actually offers. An inactive resident whose reason is
		// left out of the request keeps the one already on file.
		const submittedReason = (INACTIVE_REASONS as readonly string[]).includes(
			body.inactiveReason
		)
			? body.inactiveReason
			: null;
		const inactiveReason = !nowInactive
			? null
			: body.inactiveReason === undefined
				? previous.inactiveReason
				: submittedReason;

		// Only an inactive resident has a leaving date; accept a plain
		// YYYY-MM-DD calendar date and drop anything else. Same PATCH rule as
		// the reason: left out of the request, the date on file stands.
		const submittedDate =
			typeof body.inactiveDate === 'string' &&
			/^\d{4}-\d{2}-\d{2}$/.test(body.inactiveDate)
				? body.inactiveDate
				: null;
		const inactiveDate = !nowInactive
			? null
			: body.inactiveDate === undefined
				? previous.inactiveDate
				: submittedDate;

		const updated = await updateResident(residentId, {
			name: body.name,
			dateOfBirth: body.dateOfBirth,
			dob: body.dob, // Include dob if it's separate from dateOfBirth
			status,
			inactiveReason,
			inactiveDate,
			phone: body.phone,
			placementDate: body.placementDate
				? new Date(body.placementDate)
				: undefined,
			sex: body.sex,
			weight: body.weight,
			height: body.height,
			hairColor: body.hairColor,
			diagnosis: body.diagnosis,
			allergies: body.allergies,
			supportBroker: body.supportBroker,
			importantRelationships: body.importantRelationships,
			fundingAgency: body.fundingAgency,
			caseManagerName: body.caseManagerName,
			caseManagerPhone: body.caseManagerPhone,
			caseManagerEmail: body.caseManagerEmail,
			vocationalAgency: body.vocationalAgency,
			vocationalAgencyAddress: body.vocationalAgencyAddress,
			guardianIds: body.guardianIds,
			emergencyContact: body.emergencyContact,
			medicalInfo: body.medicalInfo,
			careNotes: body.careNotes,
			location: body.location,
			...(typeof body.carbTrackingEnabled === 'boolean'
				? {carbTrackingEnabled: body.carbTrackingEnabled}
				: {}),
			...glucose.data,
		});

		await logAudit({
			clerkUserId: userId,
			event: 'UPDATE_RESIDENT_PROFILE',
			details: `Updated profile for resident ${residentId}`,
			deviceId: 'system',
			location: body.location || '',
		});

		// Status transitions carry side effects beyond the row itself. Audited
		// separately from the profile save: "who stopped this resident's alerts,
		// and when" is a question an inspector can reasonably ask.
		if (!wasInactive && nowInactive) {
			const retired = await retireResidentNotices(residentId);
			await logAudit({
				clerkUserId: userId,
				event: 'DEACTIVATE_RESIDENT',
				details:
					`Marked resident ${residentId} inactive (${inactiveReason ?? 'no reason given'}); ` +
					`deactivated ${retired.alertsDeactivated} compliance alert(s), ` +
					`revoked ${retired.checklistLinksRevoked} guardian checklist link(s)`,
				deviceId: 'system',
				location: updated?.location || body.location || '',
			});
		} else if (wasInactive && !nowInactive) {
			// Residents do not return to the facility, so this branch is always a
			// correction of an earlier mis-tick rather than a re-admission. Worth
			// auditing loudly for exactly that reason -- it should be rare, and
			// reversing a `deceased` marking in particular is not something that
			// should pass unrecorded.
			//
			// `updated` has already had inactiveReason cleared, so the reason the
			// resident was marked inactive has to come from the pre-update read.
			const reinstated = await reinstateResidentNotices(
				residentId,
				previous.inactiveReason
			);
			await logAudit({
				clerkUserId: userId,
				event: 'REACTIVATE_RESIDENT',
				details: `Marked resident ${residentId} active again; ${reinstated.note}`,
				deviceId: 'system',
				location: updated?.location || body.location || '',
			});
		}

		return NextResponse.json(updated);
	} catch (error: any) {
		console.error('Error updating resident profile:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
