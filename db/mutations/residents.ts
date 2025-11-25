// src/db/mutations/residents.ts

import {db} from '../index';
import {residents} from '../schema';
import {eq} from 'drizzle-orm';

// ============================
// Resident Profile Management
// ============================

export async function updateResidentProfile(
	residentId: string,
	data: {
		name?: string;
		dateOfBirth?: string;
		phone?: string;
		placementDate?: Date;
		sex?: string;
		weight?: string;
		height?: string;
		hairColor?: string;
		diagnostics?: string;
		supportBroker?: string;
		importantRelationships?: string;
		fundingAgency?: string;
		caseManagerName?: string;
		caseManagerPhone?: string;
		caseManagerEmail?: string;
		vocationalAgency?: string;
		vocationalAgencyAddress?: string;
		guardianIds?: string[];
		medicalInfo?: string;
		careNotes?: string;
		location?: string;
	}
) {
	const [updated] = await db
		.update(residents)
		.set({
			...data,
		})
		.where(eq(residents.id, residentId))
		.returning();

	return updated;
}

export async function createResident(data: {
	name: string;
	location: string;
	dateOfBirth?: string;
	phone?: string;
	placementDate?: Date;
	sex?: string;
	weight?: string;
	height?: string;
	hairColor?: string;
	diagnostics?: string;
	supportBroker?: string;
	importantRelationships?: string;
	fundingAgency?: string;
	caseManagerName?: string;
	caseManagerPhone?: string;
	caseManagerEmail?: string;
	vocationalAgency?: string;
	vocationalAgencyAddress?: string;
	guardianIds?: string[];
	medicalInfo?: string;
	careNotes?: string;
	createdBy: string;
}) {
	const [resident] = await db
		.insert(residents)
		.values({
			...data,
			createdAt: new Date(),
		})
		.returning();

	return resident;
}
