import {z} from 'zod';

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
	expiresAt: z.string().datetime().optional(),
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
// FIRE DRILL SCHEMAS
// ============================================================================

export const fireDrillSchema = z.object({
	location: z.string().min(1, 'Location is required').max(255, 'Location too long'),
	year: z.number().int().min(2020).max(2100),
	sequence: z.number().int().min(1).max(12),
	drillDate: z.string().datetime('Invalid drill date format'),
	conductedBy: z.string().min(1, 'Conductor name is required').max(255, 'Name too long'),
	evacuationTime: z.string().max(50, 'Time too long').optional(),
	notes: z.string().max(2000, 'Notes too long').optional(),
});

// ============================================================================
// SMOKE DETECTOR CHECK SCHEMAS
// ============================================================================

export const smokeDetectorCheckSchema = z.object({
	location: z.string().min(1, 'Location is required').max(255, 'Location too long'),
	checkDate: z.string().datetime('Invalid check date format'),
	checkedBy: z.string().min(1, 'Inspector name is required').max(255, 'Name too long'),
	detectorStatus: z.enum(['functional', 'needs-repair', 'replaced']),
	notes: z.string().max(2000, 'Notes too long').optional(),
});

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
