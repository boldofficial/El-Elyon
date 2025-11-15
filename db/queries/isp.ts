import {db} from '../index';
import {isp} from '../schema';
import {eq, and} from 'drizzle-orm';

export async function getIspById(ispId: string) {
    return await db.query.isp.findFirst({
        where: eq(isp.id, ispId),
    });
}

export async function listIspsByResidentId(residentId: string) {
    return await db.query.isp.findMany({
        where: eq(isp.residentId, residentId),
        orderBy: (isp, {desc}) => [desc(isp.createdAt)], // Order by createdAt descending
    });
}

export async function listPublishedIspsByResidentId(residentId: string) {
    return await db.query.isp.findMany({
        where: and(eq(isp.residentId, residentId), eq(isp.published, true)),
        orderBy: (isp, {desc}) => [desc(isp.createdAt)],
    });
}
