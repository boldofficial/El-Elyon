import { db } from '../index';
import { locations } from '../schema';

export async function getAllLocations() {
    const allLocations = await db.query.locations.findMany({
        columns: {
            name: true,
        },
    });
    return allLocations.map(l => l.name);
}
