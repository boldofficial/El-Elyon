import {Webhook} from 'svix';
import {headers} from 'next/headers';
import {NextResponse} from 'next/server';
import {getUserByClerkId} from '@/db/queries/users';
import {
	// createEmployee,
	updateEmployee,
	deleteEmployee,
} from '@/db/mutations/employees';
import {getEmployeeByClerkId} from '@/db/queries/employees';
import {getRoleByClerkId, checkForAdmins} from '@/db/queries/roles';
import {createUser, deleteUser, updateUser} from '@/db/mutations/users';
import {updateRole, createRole, deleteRole} from '@/db/mutations/roles';

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

	console.log('📨 Received webhook request');
	console.log('🔍 Headers:', {
		svix_id,
		svix_timestamp,
		svix_signature: svix_signature ? 'present' : 'missing',
	});

	if (!svix_id || !svix_timestamp || !svix_signature) {
		console.error('❌ Missing Svix headers');
		return new NextResponse('Error: Missing svix headers', {
			status: 400,
		});
	}

	// Get body
	const payload = await req.text();

	console.log('📦 Payload length:', payload.length);

	// Create new Svix instance with secret
	const wh = new Webhook(WEBHOOK_SECRET);

	let evt: any;

	// Verify payload with headers
	try {
		evt = wh.verify(payload, {
			'svix-id': svix_id,
			'svix-timestamp': svix_timestamp,
			'svix-signature': svix_signature,
		});

		console.log('✅ Webhook signature verified');
	} catch (err) {
		console.error('❌ Error: Could not verify webhook:', err);
		return new NextResponse('Error: Verification error', {
			status: 400,
		});
	}

	// Handle the webhook
	const eventType = evt.type;
	const userData = evt.data;

	console.log(`📨 Processing webhook: ${eventType}`);

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

		console.log('✅ Webhook processed successfully');
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
		console.log('✅ User created:', clerkUserId);
	}

	// Check if employee exists
	const existingEmployee = await getEmployeeByClerkId(clerkUserId);

	// Check if this is first user
	const admins = await checkForAdmins();
	const isFirstUser = admins.length === 0;
	const finalRole = isFirstUser ? 'admin' : metadata.role || 'staff';

	// Admins get undefined assignedDeviceId (no device restriction)
	const assignedDeviceId =
		finalRole === 'admin' ? undefined : metadata.assignedDeviceId;

	console.log('📋 User metadata:', {
		role: finalRole,
		locations: metadata.locations,
		assignedDeviceId,
		isFirstUser,
	});

	// ✅ FIX: Don't call createEmployee if employee exists OR if this is a webhook-created user
	if (existingEmployee) {
		console.log('ℹ️  Employee already exists, updating');
		await updateEmployee(
			{
				employeeId: existingEmployee.id,
				name,
				email,
				role: finalRole as 'admin' | 'supervisor' | 'staff',
				locations: metadata.locations || [],
				assignedDeviceId,
			},
			clerkUserId
		);
	} else {
		// ✅ FIX: Create employee record directly in database without calling createEmployee
		// This avoids the circular dependency where createEmployee tries to create a Clerk user
		console.log(
			`${isFirstUser ? '🎖️  Creating first admin employee record' : '👤 Creating employee record'}`
		);

		const {db} = await import('@/db/index');
		const {employees} = await import('@/db/schema');

		const [newEmployee] = await db
			.insert(employees)
			.values({
				name,
				email,
				workEmail: email,
				role: finalRole as 'admin' | 'supervisor' | 'staff',
				locations: metadata.locations || [],
				assignedDeviceId,
				clerkUserId,
				createdAt: new Date(),
				createdBy: clerkUserId,
				employmentStatus: 'active',
				hasAcceptedInvite: true,
			})
			.returning();

		console.log('✅ Employee created:', newEmployee.id);
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
		console.log('✅ User updated:', clerkUserId);
	}

	// Update employee
	const employee = await getEmployeeByClerkId(clerkUserId);
	if (employee) {
		const currentRole =
			(metadata.role as 'admin' | 'supervisor' | 'staff') ||
			(employee.role as 'admin' | 'supervisor' | 'staff') ||
			'staff';

		// Admins get undefined assignedDeviceId
		const assignedDeviceId =
			currentRole === 'admin'
				? undefined
				: metadata.assignedDeviceId || employee.assignedDeviceId || undefined;

		await updateEmployee(
			{
				employeeId: employee.id,
				name,
				email,
				role: currentRole,
				locations: metadata.locations || employee.locations || [],
				assignedDeviceId,
			},
			clerkUserId
		);
		console.log('✅ Employee updated:', clerkUserId);
	}

	// Update role
	const role = await getRoleByClerkId(clerkUserId);
	if (role && metadata.role && metadata.locations) {
		await updateRole(clerkUserId, {
			role: metadata.role,
			locations: metadata.locations,
		});
		console.log('✅ Role updated for', clerkUserId);
	}

	console.log('✅ User updated');
}

async function handleUserDeleted(userData: any) {
	const clerkUserId = userData.id;

	console.log('🗑️  Deleting user:', clerkUserId);

	// Get employee to retrieve employeeId before deletion
	const employee = await getEmployeeByClerkId(clerkUserId);

	await deleteUser(clerkUserId);
	console.log('✅ User deleted:', clerkUserId);

	if (employee) {
		await deleteEmployee(employee.id, clerkUserId);
		console.log('✅ Employee deleted:', employee.id);
	}

	await deleteRole(clerkUserId);
	console.log('✅ Role deleted for', clerkUserId);

	console.log('✅ User deleted');
}
