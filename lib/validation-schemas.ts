import {z} from 'zod';
import {
	fireDrillReportInputSchema,
	lifeSafetyExpectedVersionSchema,
	lifeSafetyInspectionInputSchema,
	lifeSafetyVoidInputSchema,
} from './life-safety-reporting';

// ============================================================================
// MEMO SCHEMAS
// ============================================================================

export const memoSchema = z.object({
	title: z.string().min(1, 'Title is required').max(500, 'Title too long'),
	content: z.string().min(1, 'Content is required').max(10000, 'Content too long'),
	recipientType: z.enum([
		'location',
		'all-staff',
		'all-supervisors',
		'all-employees',
		'selected-locations',
		'selected-users',
	]),
	targetLocations: z.array(z.string()).optional().default([]),
	targetUsers: z.array(z.string()).optional().default([]),
	priority: z.enum(['normal', 'high', 'urgent']).default('normal'),
	expiresAt: z
		.string()
		.refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid expiry date')
		.optional(),
});

// ============================================================================
// VACATION REQUEST SCHEMAS
// ============================================================================

export const vacationRequestSchema = z
	.object({
		startDate: z.string().datetime('Invalid start date format'),
		endDate: z.string().datetime('Invalid end date format'),
		reason: z.string().min(1, 'Reason is required').max(1000, 'Reason too long'),
	})
	.refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
		message: 'End date must be after or equal to start date',
		path: ['endDate'],
	});

export const vacationRequestUpdateSchema = z.object({
	status: z.enum(['approved', 'denied']),
	adminComments: z.string().max(1000, 'Comments too long').optional(),
});

// ============================================================================
// RESIDENT DOCUMENT SCHEMAS
// ============================================================================

export const residentDocumentSchema = z.object({
	residentId: z.string().uuid('Invalid resident ID'),
	title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
	type: z.string().min(1, 'Type is required').max(50, 'Type too long'),
	description: z.string().max(1000, 'Description too long').optional(),
	fileName: z.string().min(1, 'File name is required').max(255, 'File name too long'),
	fileSize: z.number().int().positive().max(10 * 1024 * 1024, 'File too large (max 10MB)'),
	fileStorageId: z.string().min(1, 'Storage ID is required'),
});

// ============================================================================
// LIFE-SAFETY REPORTING V2 SCHEMAS
// ============================================================================

const lifeSafetyUuidSchema = z.string().uuid('Invalid ID');
const lifeSafetyYearQuerySchema = z.coerce.number().int().min(2020).max(2100);
const lifeSafetyLimitSchema = z.coerce.number().int().min(1).max(100).default(50);

export const lifeSafetyCollectionQuerySchema = z
	.object({
		locationId: lifeSafetyUuidSchema,
		year: lifeSafetyYearQuerySchema,
		includeVoided: z
			.enum(['true', 'false'])
			.default('false')
			.transform((value) => value === 'true'),
	})
	.strict();

export const lifeSafetyResidentQuerySchema = z
	.object({
		locationId: lifeSafetyUuidSchema,
	})
	.strict();

export const lifeSafetyLegacyQuerySchema = z
	.object({
		location: z
			.string()
			.trim()
			.min(1)
			.max(255)
			.refine((value) => value.toLowerCase() !== 'all', 'A concrete location is required'),
		year: lifeSafetyYearQuerySchema.optional(),
		month: z.coerce.number().int().min(1).max(12).optional(),
		sequence: z.coerce.number().int().min(1).max(2).optional(),
		cursor: lifeSafetyUuidSchema.optional(),
		limit: lifeSafetyLimitSchema,
	})
	.strict();

export const lifeSafetyInspectionCreateSchema = lifeSafetyInspectionInputSchema;
export const lifeSafetyInspectionUpdateSchema = z
	.object({
		expectedVersion: lifeSafetyExpectedVersionSchema,
		entry: lifeSafetyInspectionInputSchema,
	})
	.strict();

export const fireDrillReportCreateSchema = fireDrillReportInputSchema;
export const fireDrillReportUpdateSchema = z
	.object({
		expectedVersion: lifeSafetyExpectedVersionSchema,
		report: fireDrillReportInputSchema,
	})
	.strict();

export const lifeSafetyRecordIdSchema = lifeSafetyUuidSchema;
export const lifeSafetyRecordVoidSchema = lifeSafetyVoidInputSchema;

export type LifeSafetyCollectionQuery = z.infer<
	typeof lifeSafetyCollectionQuerySchema
>;
export type LifeSafetyLegacyQuery = z.infer<typeof lifeSafetyLegacyQuerySchema>;

// ============================================================================
// INCIDENT REPORT SCHEMAS
// ============================================================================

export const incidentReportSchema = z.object({
	residentId: z.string().uuid('Invalid resident ID'),
	incidentDate: z.string().datetime('Invalid incident date format'),
	incidentType: z.string().min(1, 'Incident type is required').max(100, 'Type too long'),
	description: z.string().min(1, 'Description is required').max(5000, 'Description too long'),
	location: z.string().min(1, 'Location is required').max(255, 'Location too long'),
	reportedBy: z.string().min(1, 'Reporter name is required').max(255, 'Name too long'),
	witnesses: z.string().max(1000, 'Witnesses too long').optional(),
	actionTaken: z.string().max(2000, 'Action taken too long').optional(),
	followUpRequired: z.boolean().default(false),
});

// ============================================================================
// EMPLOYEE SCHEMAS
// ============================================================================

export const employeeCreateSchema = z.object({
	email: z.string().email('Invalid email address'),
	firstName: z.string().min(1, 'First name is required').max(100, 'First name too long'),
	lastName: z.string().min(1, 'Last name is required').max(100, 'Last name too long'),
	role: z.enum(['admin', 'supervisor', 'staff']),
	locations: z.array(z.string()).min(1, 'At least one location is required'),
	phoneNumber: z
		.string()
		.regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number format')
		.max(20, 'Phone number too long')
		.optional(),
});

export const employeeUpdateSchema = z.object({
	firstName: z.string().min(1, 'First name is required').max(100, 'First name too long').optional(),
	lastName: z.string().min(1, 'Last name is required').max(100, 'Last name too long').optional(),
	role: z.enum(['admin', 'supervisor', 'staff']).optional(),
	locations: z.array(z.string()).min(1, 'At least one location is required').optional(),
	phoneNumber: z
		.string()
		.regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number format')
		.max(20, 'Phone number too long')
		.optional(),
	isActive: z.boolean().optional(),
});

// ============================================================================
// CARE ACTIVITY SCHEMAS
// ============================================================================

export const careActivitySchema = z.object({
	residentId: z.string().uuid('Invalid resident ID'),
	activityType: z.string().min(1, 'Activity type is required').max(100, 'Type too long'),
	completedAt: z.string().datetime('Invalid completion date format'),
	completedBy: z.string().min(1, 'Caregiver is required').max(255, 'Name too long'),
	notes: z.string().max(2000, 'Notes too long').optional(),
	duration: z.number().int().positive().optional(),
});

// ============================================================================
// GUARDIAN SCHEMAS
// ============================================================================

export const guardianSchema = z.object({
	firstName: z.string().min(1, 'First name is required').max(100, 'First name too long'),
	lastName: z.string().min(1, 'Last name is required').max(100, 'Last name too long'),
	email: z.string().email('Invalid email address'),
	phoneNumber: z
		.string()
		.regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number format')
		.max(20, 'Phone number too long'),
	relationship: z.string().min(1, 'Relationship is required').max(100, 'Relationship too long'),
	address: z.string().max(500, 'Address too long').optional(),
	isPrimary: z.boolean().default(false),
});

// ============================================================================
// ISP (Individual Service Plan) SCHEMAS
// ============================================================================

export const ispGoalSchema = z.object({
	residentId: z.string().uuid('Invalid resident ID'),
	goalDescription: z.string().min(1, 'Goal description is required').max(1000, 'Description too long'),
	targetDate: z.string().datetime('Invalid target date format'),
	status: z.enum(['active', 'completed', 'discontinued']).default('active'),
	progress: z.string().max(2000, 'Progress notes too long').optional(),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validates data against a Zod schema
 * Returns success object with parsed data or error object
 */
export function validateSchema<T>(
	schema: z.ZodSchema<T>,
	data: unknown
): {success: true; data: T} | {success: false; errors: z.ZodError} {
	const result = schema.safeParse(data);

	if (result.success) {
		return {success: true, data: result.data};
	} else {
		return {success: false, errors: result.error};
	}
}

/**
 * Formats Zod validation errors into a flat object for API responses
 * Example: {email: "Invalid email address", firstName: "First name is required"}
 */
export function formatZodErrors(error: z.ZodError): Record<string, string> {
	const formatted: Record<string, string> = {};

	error.issues.forEach((err) => {
		const path = err.path.join('.');
		formatted[path] = err.message;
	});

	return formatted;
}

/**
 * Creates a validation error response for API routes
 */
export function createValidationErrorResponse(error: z.ZodError) {
	return {
		error: 'Validation failed',
		fields: formatZodErrors(error),
	};
}
