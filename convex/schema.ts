import {defineSchema, defineTable} from 'convex/server';
import {v} from 'convex/values';

const applicationTables = {
	residents: defineTable({
		name: v.string(),
		dateOfBirth: v.optional(v.string()),
		dob: v.optional(v.string()),
		location: v.string(),
		guardianIds: v.optional(v.array(v.id('guardians'))),
		medicalInfo: v.optional(v.string()),
		careNotes: v.optional(v.string()),
		profileImageId: v.optional(v.id('_storage')),
		createdAt: v.optional(v.number()),
		createdBy: v.optional(v.string()),
	})
		.index('by_location', ['location'])
		.index('by_createdBy', ['createdBy']),

	guardians: defineTable({
		name: v.string(),
		relationship: v.optional(v.string()),
		phone: v.string(),
		email: v.string(),
		address: v.optional(v.string()),
		residentIds: v.optional(v.array(v.id('residents'))),
		createdAt: v.optional(v.number()),
		createdBy: v.optional(v.string()),
	}).index('by_createdBy', ['createdBy']),

	employees: defineTable({
		id: v.optional(v.string()),
		name: v.string(),
		email: v.optional(v.string()),
		workEmail: v.string(),
		phone: v.optional(v.string()),
		role: v.optional(
			v.union(
				v.literal('admin'),
				v.literal('supervisor'),
				v.literal('staff'),
				v.literal('')
			)
		),
		locations: v.array(v.string()),
		employmentStatus: v.optional(v.string()),
		createdAt: v.optional(v.number()),
		createdBy: v.optional(v.string()),
		updatedAt: v.optional(v.number()),
		clerkUserId: v.optional(v.string()),
		assignedDeviceId: v.optional(v.string()),
		invitedAt: v.optional(v.number()),
		invitedBy: v.optional(v.string()),
		hasAcceptedInvite: v.optional(v.boolean()),
		inviteToken: v.optional(v.string()),
		inviteExpiresAt: v.optional(v.number()),
		onboardedBy: v.optional(v.string()),
		onboardedAt: v.optional(v.number()),
		inviteBounced: v.optional(v.boolean()),
		inviteResent: v.optional(v.number()),
	})
		.index('by_workEmail', ['workEmail'])
		.index('by_email', ['email'])
		.index('by_clerkUserId', ['clerkUserId'])
		.index('by_assignedDeviceId', ['assignedDeviceId'])
		.index('by_inviteToken', ['inviteToken']),

	roles: defineTable({
		clerkUserId: v.string(),
		role: v.optional(
			v.union(
				v.literal('admin'),
				v.literal('supervisor'),
				v.literal('staff'),
				v.literal('')
			)
		),
		locations: v.optional(v.array(v.string())) || [],
		assignedBy: v.optional(v.string()),
		assignedAt: v.optional(v.number()),
		teams: v.optional(v.array(v.string())),
	}).index('by_clerkUserId', ['clerkUserId']),

	shifts: defineTable({
		clerkUserId: v.string(),
		location: v.string(),
		clockInTime: v.number(),
		clockOutTime: v.optional(v.number()),
		deviceId: v.optional(v.string()),
		kioskId: v.optional(v.id('kiosks')),
		notes: v.optional(v.string()),
		clockInSelfie: v.optional(v.id('_storage')),
		clockOutSelfie: v.optional(v.id('_storage')),
	})
		.index('by_clerkUserId', ['clerkUserId'])
		.index('by_location', ['location'])
		.index('by_clockInTime', ['clockInTime']),

	kiosks: defineTable({
		name: v.optional(v.string()),
		location: v.string(),
		deviceId: v.string(),
		deviceLabel: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal('active'),
				v.literal('inactive'),
				v.literal('maintenance'),
				v.literal('disabled'),
				v.literal('retired')
			)
		),
		active: v.optional(v.boolean()),
		lastHeartbeat: v.optional(v.number()),
		lastSeenAt: v.optional(v.number()),
		registeredAt: v.optional(v.number()),
		registeredBy: v.optional(v.string()),
		createdAt: v.optional(v.number()),
		createdBy: v.optional(v.string()),
	})
		.index('by_location', ['location'])
		.index('by_deviceId', ['deviceId']),

	resident_logs: defineTable({
		residentId: v.id('residents'),
		logType: v.optional(v.string()),
		content: v.string(),
		timestamp: v.optional(v.number()),
		createdBy: v.optional(v.string()),
		location: v.optional(v.string()),
		shiftId: v.optional(v.id('shifts')),
		authorId: v.optional(v.string()),
		version: v.optional(v.number()),
		template: v.optional(v.string()),
		createdAt: v.optional(v.number()),
		metadata: v.optional(
			v.object({
				mood: v.optional(v.string()),
				behavior: v.optional(v.string()),
				activity: v.optional(v.string()),
				notes: v.optional(v.string()),
			})
		),
	})
		.index('by_residentId', ['residentId'])
		.index('by_location', ['location'])
		.index('by_authorId', ['authorId'])
		.index('by_createdAt', ['createdAt']),

	audit_logs: defineTable({
		clerkUserId: v.optional(v.string()),
		event: v.string(),
		timestamp: v.number(),
		deviceId: v.string(),
		location: v.string(),
		details: v.optional(v.string()),
	})
		.index('by_clerkUserId', ['clerkUserId'])
		.index('by_timestamp', ['timestamp'])
		.index('by_event', ['event']),

	compliance_alerts: defineTable({
		type: v.union(v.literal('isp'), v.literal('fire_evac')),
		title: v.string(),
		description: v.string(),
		location: v.string(),
		status: v.string(),
		severity: v.string(),
		active: v.boolean(),
		createdAt: v.number(),
		dismissedBy: v.optional(v.string()),
		dismissedAt: v.optional(v.number()),
		metadata: v.optional(
			v.object({
				residentId: v.optional(v.id('residents')),
				shiftId: v.optional(v.id('shifts')),
				logType: v.optional(v.string()),
				expectedCount: v.optional(v.number()),
				actualCount: v.optional(v.number()),
			})
		),
	})
		.index('by_status', ['status'])
		.index('by_severity', ['severity'])
		.index('by_location', ['location'])
		.index('by_createdAt', ['createdAt']),

	isp_files: defineTable({
		residentId: v.id('residents'),
		versionLabel: v.string(), // e.g., "2024-Q1", "Annual Review 2024"
		effectiveDate: v.number(),
		status: v.union(
			v.literal('draft'),
			v.literal('active'),
			v.literal('archived')
		),
		fileStorageId: v.id('_storage'), // Reference to the actual PDF/DOCX file
		fileName: v.string(),
		fileSize: v.number(),
		contentType: v.string(),
		preparedBy: v.optional(v.string()),
		notes: v.optional(v.string()),
		uploadedBy: v.string(),
		uploadedAt: v.number(),
		activatedBy: v.optional(v.string()),
		activatedAt: v.optional(v.number()),
		archivedBy: v.optional(v.string()),
		archivedAt: v.optional(v.number()),
	})
		.index('by_residentId', ['residentId'])
		.index('by_status', ['status'])
		.index('by_effectiveDate', ['effectiveDate'])
		.index('by_residentId_versionLabel', ['residentId', 'versionLabel']),

	isp_access_logs: defineTable({
		ispFileId: v.id('isp_files'),
		residentId: v.id('residents'),
		clerkUserId: v.string(),
		action: v.union(
			v.literal('upload'),
			v.literal('download'),
			v.literal('view_list'),
			v.literal('activate'),
			v.literal('archive'),
			v.literal('delete')
		),
		timestamp: v.number(),
		location: v.string(),
		deviceId: v.string(),
		ipAddress: v.optional(v.string()),
		userAgent: v.optional(v.string()),
		success: v.boolean(),
		errorMessage: v.optional(v.string()),
	})
		.index('by_ispFileId', ['ispFileId'])
		.index('by_residentId', ['residentId'])
		.index('by_clerkUserId', ['clerkUserId'])
		.index('by_timestamp', ['timestamp'])
		.index('by_action', ['action']),

	isp: defineTable({
		residentId: v.id('residents'),
		published: v.optional(v.boolean()),
		content: v.optional(v.string()),
		goals: v.optional(v.array(v.string())),
		version: v.optional(v.number()),
		createdAt: v.optional(v.number()),
		dueAt: v.optional(v.number()),
	}).index('by_residentId', ['residentId']),

	isp_acknowledgments: defineTable({
		residentId: v.id('residents'),
		clerkUserId: v.string(),
		ispId: v.id('isp'),
		acknowledgedAt: v.number(),
		acknowledgedIsp: v.id('isp'),
	}).index('by_resident_and_user', ['residentId', 'clerkUserId']),

	fire_evac: defineTable({
		residentId: v.id('residents'),
		location: v.optional(v.string()),
		version: v.number(),
		mobilityNeeds: v.optional(v.string()),
		assistanceRequired: v.optional(v.string()),
		medicalEquipment: v.optional(v.string()),
		specialInstructions: v.optional(v.string()),
		createdAt: v.optional(v.number()),
		createdBy: v.optional(v.string()),
		fileStorageId: v.optional(v.id('_storage')),
		fileName: v.optional(v.string()),
		fileSize: v.optional(v.number()),
		contentType: v.optional(v.string()),
		notes: v.optional(v.string()),
	})
		.index('by_residentId', ['residentId'])
		.index('by_location', ['location']),

	config: defineTable({
		complianceReminderTemplate: v.optional(v.string()),
		guardianInviteTemplate: v.optional(v.string()),
		alertWeekday: v.optional(v.number()),
		alertHour: v.optional(v.number()),
		alertMinute: v.optional(v.number()),
		selfieEnforced: v.optional(v.boolean()),
	}),

	guardian_checklist_templates: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		questions: v.array(
			v.object({
				id: v.string(),
				text: v.string(),
				type: v.union(
					v.literal('yes_no'),
					v.literal('text'),
					v.literal('rating')
				),
				required: v.boolean(),
			})
		),
		createdBy: v.string(),
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
		updatedBy: v.optional(v.string()),
		active: v.boolean(),
	})
		.index('by_active', ['active'])
		.index('by_createdBy', ['createdBy']),

	guardian_checklist_links: defineTable({
		residentId: v.id('residents'),
		templateId: v.id('guardian_checklist_templates'),
		guardianEmail: v.string(),
		token: v.string(),
		sentDate: v.number(),
		sentBy: v.optional(v.string()),
		expiresAt: v.number(),
		completed: v.boolean(),
		completedAt: v.optional(v.number()),
		responses: v.optional(
			v.array(
				v.object({
					questionId: v.string(),
					answer: v.union(v.string(), v.number(), v.boolean()),
				})
			)
		),
	})
		.index('by_token', ['token'])
		.index('by_residentId', ['residentId'])
		.index('by_sentBy', ['sentBy'])
		.index('by_completed', ['completed']),

	kiosk_pairing_tokens: defineTable({
		token: v.string(),
		deviceId: v.string(),
		location: v.string(),
		deviceLabel: v.optional(v.string()),
		status: v.union(
			v.literal('active'),
			v.literal('used'),
			v.literal('expired')
		),
		issuedBy: v.string(),
		issuedAt: v.number(),
		expiresAt: v.number(),
		usedAt: v.optional(v.number()),
	})
		.index('by_token', ['token'])
		.index('by_status', ['status']),

	devices: defineTable({
		deviceId: v.string(), // Browser fingerprint (e.g., "a3f5d8e9c2b1...")
		deviceName: v.string(), // Human-readable name (e.g., "Kiosk 1 - Front Desk")
		location: v.string(), // Location name (e.g., "Main Office", "Building A")
		isActive: v.boolean(), // Whether this device can be used right now
		deviceType: v.optional(
			v.union(v.literal('kiosk'), v.literal('mobile'), v.literal('desktop'))
		),
		registeredBy: v.string(), // Clerk user ID of admin who registered this device
		registeredAt: v.number(), // Timestamp when device was registered
		lastUsedAt: v.optional(v.number()), // Last time someone logged in from this device
		lastUsedBy: v.optional(v.string()), // Clerk user ID of last person who used it
		metadata: v.optional(
			v.object({
				browser: v.optional(v.string()),
				os: v.optional(v.string()),
				screenResolution: v.optional(v.string()),
				ipAddress: v.optional(v.string()),
			})
		),
		notes: v.optional(v.string()), // Admin notes about this device
	})
		.index('by_deviceId', ['deviceId'])
		.index('by_location', ['location'])
		.index('by_isActive', ['isActive']),

	users: defineTable({
		clerkUserId: v.string(), // The Clerk user ID
		email: v.string(),
		name: v.optional(v.string()),
		lastLoginAt: v.optional(v.number()), // Last successful login time
		lastLoginDeviceId: v.optional(v.string()), // Device they last logged in from
		lastLoginLocation: v.optional(v.string()), // Location of last login
		createdAt: v.number(), // When they first used the app
		updatedAt: v.optional(v.number()),
	})
		.index('by_clerkUserId', ['clerkUserId'])
		.index('by_email', ['email']),

	locations: defineTable({
		name: v.string(),
		address: v.optional(v.string()),
		capacity: v.optional(v.number()),
		status: v.optional(
			v.union(
				v.literal('active'),
				v.literal('inactive'),
				v.literal('maintenance'),
				v.literal('disabled'),
				v.literal('retired')
			)
		),
		createdBy: v.optional(v.string()),
		createdAt: v.optional(v.number()),
		updatedAt: v.optional(v.number()),
	}).index('by_name', ['name']),

	// HR Files logs for audit trail
	hr_file_logs: defineTable({
		clerkUserId: v.optional(v.string()),
		hrFileId: v.id('hr_files'),
		employeeId: v.id('employees'),
		action: v.union(
			v.literal('upload'),
			v.literal('download'),
			v.literal('view_list'),
			v.literal('archive'),
			v.literal('delete')
		),
		timestamp: v.number(),
		success: v.boolean(),
		errorMessage: v.optional(v.string()),
	})
	.index('by_clerkUserId', ['clerkUserId'])
		.index('by_hrFileId', ['hrFileId'])
		.index('by_employeeId', ['employeeId'])
		.index('by_timestamp', ['timestamp'])
		.index('by_action', ['action']),

	// Compliance reminder templates
	compliance_reminder_templates: defineTable({
		name: v.string(),
		type: v.union(
			v.literal('isp'),
			v.literal('fire_evac'),
			v.literal('general')
		),
		subject: v.string(),
		body: v.string(),
		daysBeforeDue: v.number(), // Send reminder X days before due date
		active: v.boolean(),
		createdBy: v.id('users'),
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
	}).index('by_type', ['type'])
		.index('by_active', ['active']),
};

export default defineSchema(applicationTables);
