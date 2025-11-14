import {db} from '@/db/index';
import {auditLogs} from '@/db/schema';
import {InferInsertModel} from 'drizzle-orm';

type NewAuditLog = InferInsertModel<typeof auditLogs>;

// Allow clerkUserId to be null for internal actions
type LogAuditParams = Omit<NewAuditLog, 'id' | 'timestamp'> & {
	clerkUserId: string | null;
};

export async function logAudit(log: LogAuditParams) {
	await db.insert(auditLogs).values({
		...log,
		timestamp: new Date(),
	});
}
