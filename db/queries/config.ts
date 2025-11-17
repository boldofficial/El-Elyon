import {db} from '../index';
import {config} from '../schema';

/**
 * Get the application configuration settings
 * Returns the first (and only) config record
 */
export async function getAppConfig() {
	const settings = await db.query.config.findFirst();
	return settings;
}

/**
 * Get a specific config field value
 */
export async function getConfigField<
	K extends keyof typeof config.$inferSelect,
>(field: K): Promise<(typeof config.$inferSelect)[K] | undefined> {
	const settings = await getAppConfig();
	return settings?.[field];
}
