import {httpRouter} from 'convex/server';
import {httpAction} from './_generated/server';
import {internal} from './_generated/api';

const http = httpRouter();

/**
 * Clerk Webhook Endpoint
 * Configure in Clerk Dashboard → Webhooks:
 * - URL: https://your-deployment.convex.site/clerk-webhook
 * - Events: user.created, user.updated, user.deleted
 */
http.route({
	path: '/clerk-webhook',
	method: 'POST',
	handler: httpAction(async (ctx, request) => {
		// Get the raw body first (before reading headers)
		const payload = await request.text();

		// Get Svix headers (note: these use hyphens in HTTP but we'll pass as underscores to match Convex args)
		const svix_id = request.headers.get('svix-id');
		const svix_timestamp = request.headers.get('svix-timestamp');
		const svix_signature = request.headers.get('svix-signature');

		console.log('📨 Received webhook request');
		console.log('🔍 Headers:', {
			svix_id,
			svix_timestamp,
			svix_signature: svix_signature ? 'present' : 'missing',
		});

		if (!svix_id || !svix_timestamp || !svix_signature) {
			console.error('❌ Missing Svix headers');
			return new Response('Missing svix headers', {status: 400});
		}

		try {
			// Call internal action to process webhook
			await ctx.runAction(internal.clerkActions.handleClerkWebhook, {
				payload,
				headers: {
					svix_id,
					svix_timestamp,
					svix_signature,
				},
			});

			console.log('✅ Webhook processed successfully');

			return new Response(JSON.stringify({success: true}), {
				status: 200,
				headers: {'Content-Type': 'application/json'},
			});
		} catch (error) {
			console.error('❌ Webhook processing failed:', error);
			return new Response(
				JSON.stringify({
					error:
						error instanceof Error
							? error.message
							: 'Webhook processing failed',
				}),
				{
					status: 500,
					headers: {'Content-Type': 'application/json'},
				}
			);
		}
	}),
});

export default http;
