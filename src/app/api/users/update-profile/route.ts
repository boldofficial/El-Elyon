// src/app/api/users/update-profile/route.ts

import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {updateClerkUser} from '@/lib/clerk';
import {updateUser} from '@/db/mutations/users';
import {getEmployeeByClerkId} from '@/db/queries/employees';
import {db} from '@/db/index';
import {employees} from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function PUT(req: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const {firstName, lastName} = await req.json();

		// Validate inputs
		if (!firstName || typeof firstName !== 'string' || firstName.trim().length === 0) {
			return NextResponse.json({error: 'First name is required'}, {status: 400});
		}
		if (!lastName || typeof lastName !== 'string' || lastName.trim().length === 0) {
			return NextResponse.json({error: 'Last name is required'}, {status: 400});
		}

		const trimmedFirstName = firstName.trim();
		const trimmedLastName = lastName.trim();
		const fullName = `${trimmedFirstName} ${trimmedLastName}`;

		console.log('🔄 Updating user profile for:', userId, {firstName: trimmedFirstName, lastName: trimmedLastName});

		let clerkUpdateFailed = false;

		// Update Clerk user first (this triggers webhook for DB sync)
		try {
			await updateClerkUser(userId, {
				firstName: trimmedFirstName,
				lastName: trimmedLastName,
			});
			console.log('✅ Clerk user updated');
		} catch (error) {
			console.error('⚠️ Clerk update failed:', error);
			clerkUpdateFailed = true;
		}

		// Update local user record
		await updateUser(userId, {name: fullName, updatedAt: new Date()});
		console.log('✅ User record updated');

		// Update employee record directly (no admin check for self-update)
		const employee = await getEmployeeByClerkId(userId);
		if (employee) {
			await db
				.update(employees)
				.set({
					name: fullName,
					updatedAt: new Date(),
				})
				.where(eq(employees.id, employee.id));
			console.log('✅ Employee record updated');
		}

		console.log('✅ User profile updated successfully');

		return NextResponse.json({
			success: true,
			firstName: trimmedFirstName,
			lastName: trimmedLastName,
			name: fullName,
			warning: clerkUpdateFailed
				? 'Profile updated locally. Authentication display may take a moment to sync.'
				: undefined,
		});
	} catch (error) {
		console.error('Error updating user profile:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
