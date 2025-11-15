import {db} from '../index';
import {isp} from '../schema';
import {eq, InferInsertModel, InferSelectModel} from 'drizzle-orm';

type IspInsert = InferInsertModel<typeof isp>;
type IspSelect = InferSelectModel<typeof isp>;
type IspUpdate = Partial<IspInsert>;

export async function insertIsp(data: IspInsert) {
    const [newIsp] = await db.insert(isp).values(data).returning();
    return newIsp;
}

export async function updateIsp(ispId: string, data: IspUpdate) {
    const [updatedIsp] = await db.update(isp).set(data).where(eq(isp.id, ispId)).returning();
    return updatedIsp;
}
