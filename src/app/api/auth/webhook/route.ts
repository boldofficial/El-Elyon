import {Webhook} from 'svix';
import {headers} from 'next/headers';
import {NextResponse} from 'next/server';
import {
	getUserByClerkId,
} from '@/db/queries/users'; // User mutations are currently in queries/users.ts
import {
	createEmployee,
	updateEmployee,
	deleteEmployee,
} from '@/db/mutations/employees';
import {getEmployeeByClerkId} from '@/db/queries/employees';
import {
	createRole,
	updateRole,
	deleteRole,
	getRoleByClerkId,
	checkForAdmins,
} from '@/db/queries/roles';
import { createUser, deleteUser, updateUser } from '@/db/mutations/users';

export async function POST(req: Request) {
	const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

	if (!WEBHOOK_SECRET) {
		throw new Error('Please add CLERK_WEBHOOK_SECRET to .env');
	}

	// Get headers
	const headerPayload = await headers();
	const svix_id = headerPayload.get('svix-id');
	const svix_timestamp = headerPayload.get('svix-timestamp');
	const svix_signature = headerPayload.get('svix-signature');

	// If there are no headers, error out
	if (!svix_id || !svix_timestamp || !svix_signature) {
		return new NextResponse('Error: Missing svix headers', {
			status: 400,
		});
	}

	// Get body
	const payload = await req.json();
	const body = JSON.stringify(payload);

	// Create new Svix instance with secret
	const wh = new Webhook(WEBHOOK_SECRET);

	let evt: any;

	// Verify payload with headers
	try {
		evt = wh.verify(body, {
			'svix-id': svix_id,
			'svix-timestamp': svix_timestamp,
			'svix-signature': svix_signature,
		});
	} catch (err) {
		console.error('Error: Could not verify webhook:', err);
		return new NextResponse('Error: Verification error', {
			status: 400,
		});
	}

	// Handle the webhook
	const eventType = evt.type;
	const userData = evt.data;

	console.log(`📨 Webhook received: ${eventType}`);

	try {
		switch (eventType) {
			case 'user.created':
				await handleUserCreated(userData);
				break;

			case 'user.updated':
				await handleUserUpdated(userData);
				break;

			case 'user.deleted':
				await handleUserDeleted(userData);
				break;

			default:
				console.log(`ℹ️  Unhandled event type: ${eventType}`);
		}

		return NextResponse.json({success: true});
	} catch (error) {
		console.error('❌ Webhook processing error:', error);
		return new NextResponse('Error: Webhook processing failed', {
			status: 500,
		});
	}
}

async function handleUserCreated(userData: any) {
	const clerkUserId = userData.id;
	const email = userData.email_addresses?.[0]?.email_address || '';
	const name =
		`${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'User';
	const metadata = userData.public_metadata || {};

	console.log('👤 Creating user:', clerkUserId);

	// Check if user already exists
	const existingUser = await getUserByClerkId(clerkUserId);

	if (existingUser) {
		console.log('ℹ️  User already exists, updating');
		await updateUser(clerkUserId, {
			email,
			name,
			updatedAt: new Date(),
		});
	} else {
		await createUser({
			clerkUserId,
			email,
			name,
			createdAt: new Date(userData.created_at),
		});
		console.log('✅ User created');
	}

	// Check if employee exists
	const existingEmployee = await getEmployeeByClerkId(clerkUserId);

	// Check if this is first user
	const admins = await checkForAdmins();
	const isFirstUser = admins.length === 0;
	const finalRole = isFirstUser ? 'admin' : metadata.role || 'staff';

	if (existingEmployee) {
		console.log('ℹ️  Employee already exists, updating');
		await updateEmployee(
			{
				employeeId: existingEmployee.id, // Use existingEmployee.id
				name,
				email,
				role: (finalRole as 'admin' | 'supervisor' | 'staff'), // Cast to expected type
				locations: metadata.locations || [],
				assignedDeviceId: metadata.assignedDeviceId || undefined, // Convert null to undefined
			},
			clerkUserId // Pass clerkUserId as the second argument
		);
	} else {
		console.log(
			`${isFirstUser ? '🎖️  Creating first admin' : '👤 Creating employee'}`
		);
		await createEmployee(
			{
				name,
				email,
				role: (finalRole as 'admin' | 'supervisor' | 'staff'), // Cast to expected type
				locations: metadata.locations || [],
				assignedDeviceId: metadata.assignedDeviceId || undefined, // Convert null to undefined
			},
			clerkUserId // Pass clerkUserId as the second argument (adminClerkUserId)
		);
		console.log('✅ Employee created');
	}

	// Check if role exists
	const existingRole = await getRoleByClerkId(clerkUserId);

	if (existingRole) {
		console.log('ℹ️  Role already exists, updating');
		await updateRole(clerkUserId, {
			role: finalRole,
			locations: metadata.locations || [],
		});
	} else {
		await createRole({
			clerkUserId,
			role: finalRole,
			locations: metadata.locations || [],
			assignedAt: new Date(),
		});
		console.log(`✅ Role created: ${finalRole}`);
	}
}

async function handleUserUpdated(userData: any) {
	const clerkUserId = userData.id;
	const email = userData.email_addresses?.[0]?.email_address || '';
	const name =
		`${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'User';
	const metadata = userData.public_metadata || {};

	console.log('🔄 Updating user:', clerkUserId);

	// Update user
	const user = await getUserByClerkId(clerkUserId);
	if (user) {
		await updateUser(clerkUserId, {
			email,
			name,
			updatedAt: new Date(),
		});
	}

	// Update employee
	const employee = await getEmployeeByClerkId(clerkUserId);
		if (employee) {
			await updateEmployee(
				{
					employeeId: employee.id,
					name,
					email,
					role: (metadata.role as 'admin' | 'supervisor' | 'staff') || (employee.role as 'admin' | 'supervisor' | 'staff') || 'staff',
					locations: metadata.locations || employee.locations || [],
					assignedDeviceId: metadata.assignedDeviceId || employee.assignedDeviceId || undefined,
				},
				clerkUserId
			);
		}

	// Update role
	const role = await getRoleByClerkId(clerkUserId);
	if (role && metadata.role && metadata.locations) {
		await updateRole(clerkUserId, {
			role: metadata.role,
			locations: metadata.locations,
		});
	}

	console.log('✅ User updated');
}

async function handleUserDeleted(userData: any) {
	const clerkUserId = userData.id;

	console.log('🗑️  Deleting user:', clerkUserId);

	// Get employee to retrieve employeeId before deletion
	const employee = await getEmployeeByClerkId(clerkUserId);

	await deleteUser(clerkUserId);
	if (employee) {
		await deleteEmployee(employee.id, clerkUserId); // Pass employeeId and clerkUserId
	}
	await deleteRole(clerkUserId);

	console.log('✅ User deleted');
}
