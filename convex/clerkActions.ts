/* eslint-disable no-case-declarations */
'use node';
import {internalAction} from './_generated/server';
import {v} from 'convex/values';
import {createClerkClient} from '@clerk/backend';
import {Webhook} from 'svix';
import {internal} from './_generated/api';

const clerk = createClerkClient({
	secretKey: process.env.CLERK_SECRET_KEY,
});

/**
 * HTTP endpoint to receive Clerk webhooks
 */
export const handleClerkWebhook = internalAction({
	args: {
		payload: v.string(),
		headers: v.object({
			svix_id: v.string(),
			svix_timestamp: v.string(),
			svix_signature: v.string(),
		}),
	},
	handler: async (ctx, args) => {
		const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
		if (!webhookSecret) {
			throw new Error('CLERK_WEBHOOK_SECRET is not set');
		}

		console.log('📨 Received Clerk webhook');

		const wh = new Webhook(webhookSecret);
		let event: any;
		try {
			// Svix library expects headers with hyphens as keys
			const headers = {
				'svix-id': args.headers.svix_id,
				'svix-timestamp': args.headers.svix_timestamp,
				'svix-signature': args.headers.svix_signature,
			};

			event = wh.verify(args.payload, headers);
			console.log('✅ Webhook verified:', event.type);
		} catch (err) {
			console.error('❌ Webhook verification failed:', err);
			throw new Error('Invalid webhook signature');
		}

		const eventType = event.type;
		const userData = event.data;

		switch (eventType) {
			case 'user.created':
				console.log('👤 User created:', userData.id);

				// Extract metadata from Clerk user
				const metadata = userData.public_metadata || {};

				await ctx.runMutation(internal.clerk.syncUserFromClerk, {
					clerkUserId: userData.id,
					email: userData.email_addresses?.[0]?.email_address || '',
					name:
						`${userData.first_name || ''} ${userData.last_name || ''}`.trim() ||
						'User',
					createdAt: userData.created_at,
					// Pass metadata for employee creation
					role: metadata.role || 'staff',
					locations: metadata.locations || [],
					assignedDeviceId: metadata.assignedDeviceId,
				});
				break;

			case 'user.updated':
				console.log('🔄 User updated:', userData.id);

				const updateMetadata = userData.public_metadata || {};

				await ctx.runMutation(internal.clerk.updateUserFromClerk, {
					clerkUserId: userData.id,
					email: userData.email_addresses?.[0]?.email_address || '',
					name:
						`${userData.first_name || ''} ${userData.last_name || ''}`.trim() ||
						'User',
					role: updateMetadata.role,
					locations: updateMetadata.locations,
					assignedDeviceId: updateMetadata.assignedDeviceId,
				});
				break;

			case 'user.deleted':
				console.log('🗑️  User deleted:', userData.id);
				await ctx.runMutation(internal.clerk.deleteUserFromClerk, {
					clerkUserId: userData.id,
				});
				break;

			default:
				console.log('ℹ️  Unhandled Clerk webhook event:', eventType);
				break;
		}

		return {success: true};
	},
});

/**
 * Create a Clerk user programmatically with metadata
 * ✅ FIXED: Now stores role/locations/device in Clerk metadata
 */
export const createClerkUser = internalAction({
	args: {
		email: v.string(),
		password: v.string(),
		firstName: v.string(),
		lastName: v.string(),
		role: v.union(
			v.literal('admin'),
			v.literal('supervisor'),
			v.literal('staff')
		),
		locations: v.array(v.string()) || [],
		assignedDeviceId: v.optional(v.string()) || undefined,
	},
	handler: async (ctx, args) => {
		try {
			console.log('🔐 Creating Clerk user:', args.email);

			// Generate username from email (before @ symbol)
			const username = args.email.split('@')[0].toLowerCase();

			// ✅ KEY FIX: Store role/locations/device in Clerk metadata
			const user = await clerk.users.createUser({
				emailAddress: [args.email],
				password: args.password,
				firstName: args.firstName,
				lastName: args.lastName,
				username: username,
				skipPasswordChecks: false,
				skipPasswordRequirement: false,
				// ✅ CRITICAL: Store all employee data in Clerk
				publicMetadata: {
					role: args.role,
					locations: args.locations,
					assignedDeviceId: args.assignedDeviceId,
					systemRole: 'employee',
				},
			});

			console.log('✅ Clerk user created with metadata:', user.id);

			return {
				clerkUserId: user.id,
				email: user.emailAddresses[0].emailAddress,
			};
		} catch (error: any) {
			console.error('❌ Error creating Clerk user:', error);

			if (error.errors) {
				const errorMessages = error.errors
					.map((e: any) => e.longMessage || e.message)
					.join(', ');
				throw new Error(`Failed to create Clerk user: ${errorMessages}`);
			}

			throw new Error(
				`Failed to create Clerk user: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	},
});

/**
 * Update a Clerk user's basic information
 * Used when users update their profile (name, email)
 */
export const updateClerkUser = internalAction({
	args: {
		userId: v.string(),
		email: v.optional(v.string()),
		firstName: v.optional(v.string()),
		lastName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		try {
			console.log('🔄 Updating Clerk user:', args.userId);

			const updateData: any = {};

			// Update email if provided
			if (args.email) {
				updateData.emailAddress = [args.email];
			}

			// Update name if provided
			if (args.firstName !== undefined) {
				updateData.firstName = args.firstName;
			}
			if (args.lastName !== undefined) {
				updateData.lastName = args.lastName;
			}

			const user = await clerk.users.updateUser(args.userId, updateData);

			console.log('✅ Clerk user updated');

			return {
				success: true,
				email: user.emailAddresses[0]?.emailAddress,
				name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
			};
		} catch (error: any) {
			console.error('❌ Error updating Clerk user:', error);

			if (error.errors) {
				const errorMessages = error.errors
					.map((e: any) => e.longMessage || e.message)
					.join(', ');
				throw new Error(`Failed to update Clerk user: ${errorMessages}`);
			}

			throw new Error(
				`Failed to update Clerk user: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	},
});

/**
 * Delete a Clerk user
 */
export const deleteClerkUser = internalAction({
	args: {
		clerkUserId: v.string(),
	},
	handler: async (ctx, args) => {
		try {
			console.log('🗑️  Deleting Clerk user:', args.clerkUserId);
			await clerk.users.deleteUser(args.clerkUserId);
			console.log('✅ Clerk user deleted');
			return {success: true};
		} catch (error) {
			console.error('❌ Error deleting Clerk user:', error);
			throw new Error(
				`Failed to delete Clerk user: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	},
});

/**
 * Get Clerk user by ID with metadata
 */
export const getClerkUserById = internalAction({
	args: {
		id: v.string(),
	},
	handler: async (ctx, args) => {
		try {
			const user = await clerk.users.getUser(args.id);
			return {
				id: user.id,
				email: user.emailAddresses[0]?.emailAddress,
				name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
				metadata: user.publicMetadata,
			};
		} catch (error) {
			console.error('❌ Error getting Clerk user:', error);
			throw new Error(
				`Failed to get Clerk user: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	},
});

/**
 * Update Clerk user metadata (for keeping role/locations in sync)
 */
export const updateClerkMetadata = internalAction({
	args: {
		clerkUserId: v.string(),
		role: v.union(
			v.literal('admin'),
			v.literal('supervisor'),
			v.literal('staff')
		),
		locations: v.array(v.string()) || [],
		assignedDeviceId: v.optional(v.string()) || undefined,
	},
	handler: async (ctx, args) => {
		try {
			console.log('🔄 Updating Clerk metadata for:', args.clerkUserId);

			await clerk.users.updateUserMetadata(args.clerkUserId, {
				publicMetadata: {
					role: args.role,
					locations: args.locations,
					assignedDeviceId: args.assignedDeviceId,
					systemRole: 'employee',
				},
			});

			console.log('✅ Clerk metadata updated');
			return {success: true};
		} catch (error) {
			console.error('❌ Error updating Clerk metadata:', error);
			throw new Error(
				`Failed to update Clerk metadata: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	},
});
