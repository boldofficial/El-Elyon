/**
 * Resident mutations used to be defined twice: here and in ./residents.ts.
 *
 * The two copies had drifted. This one's deleteResident never cleaned up
 * guardians.resident_ids, so deleting through DELETE /api/people/[id] left
 * dangling resident ids in guardian records, while deleteResidentWithAuth
 * (residents.ts) cleaned them up correctly. Both were unreachable in practice
 * because they called db.transaction(), which throws on the neon-http driver -
 * so the divergence had never actually bitten.
 *
 * ./residents.ts is now the single implementation. This module re-exports it so
 * existing importers keep working; prefer importing from ./residents directly.
 */
export {insertResident, updateResident, deleteResident} from './residents';
