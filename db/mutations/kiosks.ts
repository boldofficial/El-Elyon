import {db} from '../index';
import {kiosks} from '../schema';
import {eq, InferInsertModel, InferSelectModel} from 'drizzle-orm';

type KioskInsert = InferInsertModel<typeof kiosks>;
type KioskSelect = InferSelectModel<typeof kiosks>;
type KioskUpdate = Partial<KioskInsert>;

export async function insertKiosk(data: KioskInsert) {
    const [newKiosk] = await db.insert(kiosks).values(data).returning();
    return newKiosk;
}

export async function updateKiosk(kioskId: string, data: KioskUpdate) {
    const [updatedKiosk] = await db.update(kiosks).set(data).where(eq(kiosks.id, kioskId)).returning();
    return updatedKiosk;
}

export async function deleteKiosk(kioskId: string) {
    await db.delete(kiosks).where(eq(kiosks.id, kioskId));
}
