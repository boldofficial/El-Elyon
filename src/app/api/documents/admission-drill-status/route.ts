import {auth} from '@clerk/nextjs/server';
import {listAdmissionDrillFactsForLocation} from '@/db/queries/life-safety';
import {lifeSafetyResidentQuerySchema} from '@/lib/validation-schemas';
import {lifeSafetyErrorResponse, lifeSafetyJson} from '../_life-safety-route';

// Residents of one house with the facts needed to run the admission-drill
// countdown (placement anchor + latest admission drill). Evaluation happens
// client-side with evaluateAdmissionDrill so the workspace and the compliance
// cron share one set of rules.
export async function GET(request: Request) {
	try {
		const {userId} = await auth();
		if (!userId) return lifeSafetyJson({error: 'Not authenticated'}, {status: 401});
		const query = lifeSafetyResidentQuerySchema.parse(
			Object.fromEntries(new URL(request.url).searchParams)
		);
		return lifeSafetyJson({
			data: await listAdmissionDrillFactsForLocation({clerkUserId: userId, ...query}),
		});
	} catch (error) {
		return lifeSafetyErrorResponse(error);
	}
}
