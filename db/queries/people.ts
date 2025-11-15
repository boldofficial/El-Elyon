import {db} from '../index';
import {residents, guardians, guardianChecklistTemplates} from '../schema';
import {eq} from 'drizzle-orm';

export async function getResidentById(residentId: string) {
    return await db.query.residents.findFirst({
        where: eq(residents.id, residentId),
    });
}

export async function listAllResidents() {
    return await db.query.residents.findMany();
}

export async function listResidentsByLocation(location: string) {
    return await db.query.residents.findMany({
        where: eq(residents.location, location),
    });
}

export async function getGuardianById(guardianId: string) {
    return await db.query.guardians.findFirst({
        where: eq(guardians.id, guardianId),
    });
}

export async function listAllGuardians() {
    return await db.query.guardians.findMany();
}

export async function getGuardianByEmail(email: string) {
    return await db.query.guardians.findFirst({
        where: eq(guardians.email, email),
    });
}

export async function getGuardianChecklistTemplates() {
    return await db.query.guardianChecklistTemplates.findMany();
}
