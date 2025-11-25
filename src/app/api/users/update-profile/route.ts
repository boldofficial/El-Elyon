// src/app/api/users/update-profile/route.ts

import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {updateClerkUser} from '@/lib/clerk';
import {updateUser} from '@/db/mutations/users';
import {updateEmployee} from '@/db/mutations/employees';

import {getEmployeeByClerkId} from '@/db/queries/employees';
import {getRoleByClerkId, updateRole} from '@/db/queries/roles';

export async function PUT(req: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const {name, email} = await req.json();

		console.log('🔄 Updating user profile for:', userId, {name, email});

		// Update Clerk user first
		try {
			await updateClerkUser(userId, {firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' '), email});
			console.log('✅ Clerk user updated');
		} catch (error) {
			console.error('❌ Failed to update Clerk user:', error);
			return NextResponse.json(
				{error: 'Failed to update email in authentication system'},
				{status: 500}
			);
		}

		// Update local database records
		await updateUser(userId, {name, email, updatedAt: new Date()});
		console.log('✅ User record updated');

		const employee = await getEmployeeByClerkId(userId);
		if (employee) {
			await updateEmployee(
				{
					employeeId: employee.id,
					name,
					email,
					role: (employee.role as 'admin' | 'supervisor' | 'staff') || 'staff', // Cast to expected type or default
					locations: employee.locations || [],
					assignedDeviceId: employee.assignedDeviceId || undefined, // Convert null to undefined
				},
				userId
			);
			console.log('✅ Employee record updated');
		}

		// Update role if necessary (e.g., if locations are part of profile)
		// For now, assuming role and locations are managed via admin panel or webhook,
		// but if profile updates could affect them, this would need to be extended.
		const role = await getRoleByClerkId(userId);
		if (role) {
			// If name/email changes affect how roles are displayed or managed, update here.
			// For now, no direct role update needed from user profile.
		}


		console.log('✅ User profile updated successfully');

		return NextResponse.json({success: true});
	} catch (error) {
		console.error('Error updating user profile:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
