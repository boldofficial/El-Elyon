// src/app/api/care/dashboard-notifications/route.ts
//
// Aggregate feed for the dashboard notification area shown under the Clock In
// button. Returns the items the current user needs to see at a glance:
//   - pendingIspAcks: active ISP files (at their locations) not yet acknowledged
//   - unreadMemos:    memos targeted at them that they haven't read
//   - complianceReminders: ISP/fire-evac/smoke/fire-drill deadlines
//   - carbLogReminders: residents at their locations with an open or missed
//                       main meal on today's carb log (non-blocking)
//   - glucoseReminders: blood sugar checks due or missed today, rechecks still
//                       owed, and (supervisors/admins) out-of-range readings
//                       not yet reviewed

import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getPendingISPFileAcknowledgments} from '@/db/queries/isp';
import {getMemos} from '@/db/queries/memos';
import {getComplianceRemindersForUser} from '@/db/queries/compliance';
import {getCarbLogRemindersForUser} from '@/db/queries/carb-logs';
import {getGlucoseRemindersForUser} from '@/db/queries/blood-glucose-logs';

export async function GET() {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const [
			pendingIspAcks,
			memoRows,
			complianceReminders,
			carbLogReminders,
			glucoseReminders,
		] = await Promise.all([
			getPendingISPFileAcknowledgments(userId),
			getMemos({clerkUserId: userId, unreadOnly: true, limit: 20}),
			getComplianceRemindersForUser(userId),
			getCarbLogRemindersForUser(userId),
			getGlucoseRemindersForUser(userId),
		]);

		const unreadMemos = memoRows.map((r) => r.memo);

		return NextResponse.json({
			pendingIspAcks,
			unreadMemos,
			complianceReminders,
			carbLogReminders,
			glucoseReminders,
		});
	} catch (error: any) {
		console.error('Error building dashboard notifications:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
