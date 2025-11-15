import {db} from '../index';
import {config} from '../schema';
import {eq, InferInsertModel} from 'drizzle-orm';

type ConfigInsert = InferInsertModel<typeof config>;
type ConfigUpdate = Partial<ConfigInsert>;

export async function insertConfig(data: ConfigInsert) {
    const [newConfig] = await db.insert(config).values(data).returning();
    return newConfig;
}

export async function updateConfig(id: string, data: ConfigUpdate) {
    const [updatedConfig] = await db.update(config).set(data).where(eq(config.id, id)).returning();
    return updatedConfig;
}

export async function upsertConfig(data: ConfigUpdate) {
    const existingConfig = await db.query.config.findFirst();

    if (existingConfig) {
        // Update existing config
        const [updatedConfig] = await db.update(config).set(data).where(eq(config.id, existingConfig.id)).returning();
        return updatedConfig;
    } else {
        // Create new config
        const [newConfig] = await db.insert(config).values(data as ConfigInsert).returning();
        return newConfig;
    }
}
