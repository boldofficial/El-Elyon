export interface OrphanedRecord {
	id: string;
	reason: string;
	[key: string]: any;
}

export interface ScanResults {
	totalOrphaned: number;
	summary: Record<string, number>;
	orphanedData: Record<string, OrphanedRecord[]>;
}

export interface ExistingIds {
	employeeIds: (string | null)[];
	userIds: string[];
	residentIds: string[];
	guardianIds: string[];
	kioskIds: string[];
	ispFileIds: string[];
	ispIds: string[];
}
