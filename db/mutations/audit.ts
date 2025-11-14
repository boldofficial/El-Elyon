import {db} from '@/db';
import {auditLogs} from '@/db/schema';
import {InferInsertModel} from 'drizzle-orm';

type NewAuditLog = InferInsertModel<typeof auditLogs>;

export async function logAudit(log: Omit<NewAuditLog, 'id' | 'timestamp'>) {
	await db.insert(auditLogs).values({
		...log,
		timestamp: new Date(),
	});
}
