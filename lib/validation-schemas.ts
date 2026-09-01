import {z} from 'zod';
import {
	fireDrillReportInputSchema,
	lifeSafetyExpectedVersionSchema,
	lifeSafetyInspectionInputSchema,
	lifeSafetyVoidInputSchema,
} from './life-safety-reporting';
import {
	MAX_ACTION_LENGTH,
	MAX_COMMENT_LENGTH,
	MAX_SUPERSEDE_REASON_LENGTH,
	MAX_VOID_REASON_LENGTH,
	WATER_TEMPERATURE_FIXTURES,
	fahrenheitReadingSchema,
	operationalDateSchema,
	shiftSlotSchema,
	staffIdSchema,
	staffInitialsSchema,
	staffNameSchema,
} from './water-temperature';

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
// DAILY WATER-TEMPERATURE CHECK SCHEMAS
//
// Reuses lib/water-temperature.ts's Zod building blocks (shiftSlotSchema,
// operationalDateSchema, fahrenheitReadingSchema, staff* schemas, the
// MAX_*_LENGTH constants) rather than duplicating them -- see U1. These are
// the *wire* contracts for the U3 API routes. Staff-facing create/action/
// recheck requests deliberately omit identity fields (locationId/
// shiftSlot/operationalDate/staffId/staffName/staffInitials): the server
// derives those exclusively from the caller's active shift (R16). Only
// privileged (supervisor/admin) manual-entry and correction requests carry
// those fields explicitly, alongside a required reason.
// ============================================================================

const waterTemperatureUuidSchema = z.string().uuid('Invalid ID');
const waterTemperatureExpectedVersionSchema = z.number().int().min(1);

export const waterTemperatureIdempotencyKeySchema = z
	.string()
	.trim()
	.min(1, 'Idempotency key is required')
	.max(100, 'Idempotency key must be 100 characters or fewer')
	.regex(/^[A-Za-z0-9_-]+$/, 'Idempotency key must contain only letters, numbers, - or _');

// Control characters (other than the newline/carriage-return/tab already
// implied by free text) are rejected outright rather than stripped, so a
// malformed submission fails validation instead of silently losing content.
const WATER_TEMPERATURE_CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

function waterTemperatureNarrativeText(label: string, maxLength: number, required: boolean) {
	const base = z
		.string()
		.trim()
		.max(maxLength, `${label} must be ${maxLength} characters or fewer`)
		.refine(
			(value) => !WATER_TEMPERATURE_CONTROL_CHAR_PATTERN.test(value),
			`${label} contains unsupported control characters`
		);
	return required ? base.min(1, `${label} is required`) : base;
}

function optionalWaterTemperatureNarrativeText(label: string, maxLength: number) {
	return z
		.union([waterTemperatureNarrativeText(label, maxLength, false), z.literal('')])
		.nullable()
		.optional()
		.transform((value) => (value ? value : null));
}

// Staff/inspector-facing guidance (surfaced by U4's UI, not enforced here
// beyond length/character bounds): do not enter resident-identifying or
// medical information in comments/action text, since it appears in
// inspector and print output.
export const waterTemperatureCommentsSchema = optionalWaterTemperatureNarrativeText(
	'Comments',
	MAX_COMMENT_LENGTH
);
export const waterTemperatureOptionalActionTextSchema = optionalWaterTemperatureNarrativeText(
	'Action taken',
	MAX_ACTION_LENGTH
);
export const waterTemperatureActionTextSchema = waterTemperatureNarrativeText(
	'Action taken',
	MAX_ACTION_LENGTH,
	true
);
export const waterTemperatureReasonSchema = waterTemperatureNarrativeText(
	'Reason',
	MAX_VOID_REASON_LENGTH,
	true
);
export const waterTemperatureSupersedeReasonSchema = waterTemperatureNarrativeText(
	'Supersede reason',
	MAX_SUPERSEDE_REASON_LENGTH,
	true
);

export const waterTemperatureRecordIdSchema = waterTemperatureUuidSchema;

export const waterTemperatureMonthQuerySchema = z
	.object({
		locationId: waterTemperatureUuidSchema,
		year: z.coerce.number().int().min(2020).max(2100),
		month: z.coerce.number().int().min(1).max(12),
		includeVoided: z
			.enum(['true', 'false'])
			.default('false')
			.transform((value) => value === 'true'),
	})
	.strict();

export const waterTemperatureStaffCreateSchema = z
	.object({
		source: z.literal('shift'),
		kitchenTempF: fahrenheitReadingSchema,
		bathTempF: fahrenheitReadingSchema,
		comments: waterTemperatureCommentsSchema,
		idempotencyKey: waterTemperatureIdempotencyKeySchema,
	})
	.strict();

export const waterTemperatureManualCreateSchema = z
	.object({
		source: z.literal('manual'),
		locationId: waterTemperatureUuidSchema,
		shiftSlot: shiftSlotSchema,
		operationalDate: operationalDateSchema,
		kitchenTempF: fahrenheitReadingSchema,
		bathTempF: fahrenheitReadingSchema,
		staffId: staffIdSchema,
		staffName: staffNameSchema,
		staffInitials: staffInitialsSchema,
		observedAt: z.coerce.date(),
		comments: waterTemperatureCommentsSchema,
		reason: waterTemperatureReasonSchema,
		idempotencyKey: waterTemperatureIdempotencyKeySchema,
	})
	.strict();

export const waterTemperatureCreateRequestSchema = z.discriminatedUnion('source', [
	waterTemperatureStaffCreateSchema,
	waterTemperatureManualCreateSchema,
]);

export const waterTemperatureActionRequestSchema = z
	.object({
		type: z.literal('action'),
		expectedVersion: waterTemperatureExpectedVersionSchema,
		action: waterTemperatureActionTextSchema,
		idempotencyKey: waterTemperatureIdempotencyKeySchema,
	})
	.strict();

export const waterTemperatureRecheckRequestSchema = z
	.object({
		type: z.literal('recheck'),
		expectedVersion: waterTemperatureExpectedVersionSchema,
		fixture: z.enum(WATER_TEMPERATURE_FIXTURES),
		tempF: fahrenheitReadingSchema,
		measuredAt: z.coerce.date(),
		idempotencyKey: waterTemperatureIdempotencyKeySchema,
	})
	.strict();

export const waterTemperatureSupersedeRequestSchema = z
	.object({
		type: z.literal('supersede'),
		expectedVersion: waterTemperatureExpectedVersionSchema,
		recheckId: waterTemperatureUuidSchema,
		reason: waterTemperatureSupersedeReasonSchema,
		idempotencyKey: waterTemperatureIdempotencyKeySchema,
	})
	.strict();

export const waterTemperatureRecheckRouteRequestSchema = z.discriminatedUnion('type', [
	waterTemperatureActionRequestSchema,
	waterTemperatureRecheckRequestSchema,
	waterTemperatureSupersedeRequestSchema,
]);

export const waterTemperatureCorrectionRequestSchema = z
	.object({
		expectedVersion: waterTemperatureExpectedVersionSchema,
		reason: waterTemperatureReasonSchema,
		kitchenTempF: fahrenheitReadingSchema,
		bathTempF: fahrenheitReadingSchema,
		comments: waterTemperatureCommentsSchema,
		action: waterTemperatureOptionalActionTextSchema,
		idempotencyKey: waterTemperatureIdempotencyKeySchema,
	})
	.strict();

export const waterTemperatureVoidRequestSchema = z
	.object({
		expectedVersion: waterTemperatureExpectedVersionSchema,
		reason: waterTemperatureReasonSchema,
		idempotencyKey: waterTemperatureIdempotencyKeySchema,
	})
	.strict();

export type WaterTemperatureCreateRequest = z.infer<typeof waterTemperatureCreateRequestSchema>;
export type WaterTemperatureRecheckRouteRequest = z.infer<typeof waterTemperatureRecheckRouteRequestSchema>;
export type WaterTemperatureMonthQuery = z.infer<typeof waterTemperatureMonthQuerySchema>;

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
