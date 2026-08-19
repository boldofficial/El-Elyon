import {
	pgTable,
	text,
	varchar,
	integer,
	timestamp,
	boolean,
	jsonb,
	index,
	uuid,
} from 'drizzle-orm/pg-core';
import {relations} from 'drizzle-orm';

// Create a custom table creator with a prefix
// const pgTable = pgTableCreator((name) => `el_elyon_${name}`);

// Residents Table
export const residents = pgTable(
	'residents',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: varchar('name', {length: 255}).notNull(),
		dateOfBirth: varchar('date_of_birth', {length: 50}),
		dob: varchar('dob', {length: 50}),
		location: varchar('location', {length: 255}).notNull(),
		status: varchar('status', {length: 20}).notNull().default('active'),
		inactiveReason: varchar('inactive_reason', {length: 50}),

		// NEW FIELDS
		phone: varchar('phone', {length: 50}),
		placementDate: timestamp('placement_date'),
		sex: varchar('sex', {length: 20}),
		weight: varchar('weight', {length: 50}),
		height: varchar('height', {length: 50}),
		hairColor: varchar('hair_color', {length: 50}),
		diagnosis: text('diagnosis'),
		supportBroker: varchar('support_broker', {length: 255}),
		importantRelationships: text('important_relationships'),

		// Funding & Case Management
		fundingAgency: varchar('funding_agency', {length: 255}),
		caseManagerName: varchar('case_manager_name', {length: 255}),
		caseManagerPhone: varchar('case_manager_phone', {length: 50}),
		caseManagerEmail: varchar('case_manager_email', {length: 255}),

		// Vocational Agency
		vocationalAgency: varchar('vocational_agency', {length: 255}),
		vocationalAgencyAddress: text('vocational_agency_address'),

		// Existing fields
		guardianIds: jsonb('guardian_ids').$type<string[]>(),
		emergencyContact: text('emergency_contact'),
		medicalInfo: text('medical_info'),
		careNotes: text('care_notes'),
		profileImageId: varchar('profile_image_id', {length: 500}),
		createdAt: timestamp('created_at').defaultNow(),
		createdBy: varchar('created_by', {length: 255}),
	},
	(table) => ({
		locationIdx: index('residents_location_idx').on(table.location),
		createdByIdx: index('residents_created_by_idx').on(table.createdBy),
	})
);

// Guardians Table
export const guardians = pgTable(
	'guardians',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: varchar('name', {length: 255}).notNull(),
		relationship: varchar('relationship', {length: 100}),
		phone: varchar('phone', {length: 50}).notNull(),
		email: varchar('email', {length: 255}).notNull(),
		address: text('address'),
		residentIds: jsonb('resident_ids').$type<string[]>(),
		createdAt: timestamp('created_at').defaultNow(),
		createdBy: varchar('created_by', {length: 255}),
	},
	(table) => ({
		createdByIdx: index('guardians_created_by_idx').on(table.createdBy),
	})
);

// Employees Table
export const employees = pgTable(
	'employees',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		employeeId: varchar('employee_id', {length: 255}),
		name: varchar('name', {length: 255}).notNull(),
		email: varchar('email', {length: 255}),
		workEmail: varchar('work_email', {length: 255}).notNull(),
		phone: varchar('phone', {length: 50}),
		role: varchar('role', {length: 50}),
		locations: jsonb('locations').$type<string[]>().notNull().default([]),
		employmentStatus: varchar('employment_status', {length: 100}),

		// NEW HR FIELDS
		dateOfHire: timestamp('date_of_hire'),
		tbTestFileId: varchar('tb_test_file_id', {length: 500}),
		tbTestExpiresAt: timestamp('tb_test_expires_at'),
		backgroundCheckFileId: varchar('background_check_file_id', {length: 500}),
		backgroundCheckExpiresAt: timestamp('background_check_expires_at'),
		applicationFormFileId: varchar('application_form_file_id', {length: 500}),
		personalBio: text('personal_bio'),

		// Existing fields
		createdAt: timestamp('created_at').defaultNow(),
		createdBy: varchar('created_by', {length: 255}),
		updatedAt: timestamp('updated_at'),
		clerkUserId: varchar('clerk_user_id', {length: 255}),
		assignedDeviceId: varchar('assigned_device_id', {length: 255}),
		invitedAt: timestamp('invited_at'),
		invitedBy: varchar('invited_by', {length: 255}),
		hasAcceptedInvite: boolean('has_accepted_invite'),
		inviteToken: varchar('invite_token', {length: 255}),
		inviteExpiresAt: timestamp('invite_expires_at'),
		onboardedBy: varchar('onboarded_by', {length: 255}),
		onboardedAt: timestamp('onboarded_at'),
		inviteBounced: boolean('invite_bounced'),
		inviteResent: integer('invite_resent'),
	},
	(table) => ({
		workEmailIdx: index('employees_work_email_idx').on(table.workEmail),
		emailIdx: index('employees_email_idx').on(table.email),
		clerkUserIdIdx: index('employees_clerk_user_id_idx').on(table.clerkUserId),
		assignedDeviceIdIdx: index('employees_assigned_device_id_idx').on(
			table.assignedDeviceId
		),
		inviteTokenIdx: index('employees_invite_token_idx').on(table.inviteToken),
	})
);

// Roles Table
export const roles = pgTable(
	'roles',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		clerkUserId: varchar('clerk_user_id', {length: 255}).notNull(),
		role: varchar('role', {length: 50}),
		locations: jsonb('locations').$type<string[]>().default([]),
		assignedBy: varchar('assigned_by', {length: 255}),
		assignedAt: timestamp('assigned_at'),
		teams: jsonb('teams').$type<string[]>(),
	},
	(table) => ({
		clerkUserIdIdx: index('roles_clerk_user_id_idx').on(table.clerkUserId),
	})
);

// Delegated Admin Privileges Table
export const adminPrivileges = pgTable(
	'admin_privileges',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		clerkUserId: varchar('clerk_user_id', {length: 255}).notNull(),
		privilege: varchar('privilege', {length: 100}).notNull(),
		grantedBy: varchar('granted_by', {length: 255}).notNull(),
		grantedAt: timestamp('granted_at').notNull().defaultNow(),
		revokedBy: varchar('revoked_by', {length: 255}),
		revokedAt: timestamp('revoked_at'),
	},
	(table) => ({
		clerkUserIdIdx: index('admin_privileges_clerk_user_id_idx').on(
			table.clerkUserId
		),
		activeIdx: index('admin_privileges_active_idx').on(
			table.clerkUserId,
			table.privilege
		),
	})
);

// Shifts Table
export const shifts = pgTable(
	'shifts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		clerkUserId: varchar('clerk_user_id', {length: 255}).notNull(),
		location: varchar('location', {length: 255}).notNull(),
		clockInTime: timestamp('clock_in_time').notNull(),
		clockOutTime: timestamp('clock_out_time'),
		deviceId: varchar('device_id', {length: 255}),
		kioskId: uuid('kiosk_id'),
		notes: text('notes'),
		clockInSelfie: varchar('clock_in_selfie', {length: 255}),
		clockOutSelfie: varchar('clock_out_selfie', {length: 255}),
	},
	(table) => ({
		clerkUserIdIdx: index('shifts_clerk_user_id_idx').on(table.clerkUserId),
		locationIdx: index('shifts_location_idx').on(table.location),
		clockInTimeIdx: index('shifts_clock_in_time_idx').on(table.clockInTime),
	})
);

// Kiosks Table
export const kiosks = pgTable(
	'kiosks',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: varchar('name', {length: 255}),
		location: varchar('location', {length: 255}).notNull(),
		deviceId: varchar('device_id', {length: 255}).notNull(),
		deviceLabel: varchar('device_label', {length: 255}),
		status: varchar('status', {length: 50}),
		active: boolean('active'),
		lastHeartbeat: timestamp('last_heartbeat'),
		lastSeenAt: timestamp('last_seen_at'),
		registeredAt: timestamp('registered_at'),
		registeredBy: varchar('registered_by', {length: 255}),
		createdAt: timestamp('created_at').defaultNow(),
		createdBy: varchar('created_by', {length: 255}),
	},
	(table) => ({
		locationIdx: index('kiosks_location_idx').on(table.location),
		deviceIdIdx: index('kiosks_device_id_idx').on(table.deviceId),
	})
);

// Resident Logs Table
export const residentLogs = pgTable(
	'resident_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		residentId: uuid('resident_id')
			.notNull()
			.references(() => residents.id, {onDelete: 'cascade'}),
		logType: varchar('log_type', {length: 100}), // e.g., 'daily_notes', 'medication'
		content: text('content'), // General notes
		timestamp: timestamp('timestamp').defaultNow(),
		createdBy: varchar('created_by', {length: 255}),
		location: varchar('location', {length: 255}),
		shiftId: uuid('shift_id').references(() => shifts.id),
		authorId: varchar('author_id', {length: 255}),
		authorName: varchar('author_name', {length: 255}),
		version: integer('version').default(1),
		template: varchar('template', {length: 255}),
		createdAt: timestamp('created_at').defaultNow(),
		// metadata: jsonb('metadata').$type<{
		// 	mood?: string;
		// 	behavior?: string;
		// 	activity?: string;
		// 	notes?: string;
		// }>(), // This will be replaced by residentLogActivities and incidentReports tables
	},
	(table) => ({
		residentIdIdx: index('resident_logs_resident_id_idx').on(table.residentId),
		locationIdx: index('resident_logs_location_idx').on(table.location),
		authorIdIdx: index('resident_logs_author_id_idx').on(table.authorId),
		authorNameIdx: index('resident_logs_author_name_idx').on(table.authorName),
		createdAtIdx: index('resident_logs_created_at_idx').on(table.createdAt),
	})
);

// Audit Logs Table
export const auditLogs = pgTable(
	'audit_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		clerkUserId: varchar('clerk_user_id', {length: 255}),
		event: varchar('event', {length: 255}).notNull(),
		timestamp: timestamp('timestamp').notNull(),
		deviceId: varchar('device_id', {length: 255}).notNull(),
		location: varchar('location', {length: 255}).notNull(),
		details: text('details'),
	},
	(table) => ({
		clerkUserIdIdx: index('audit_logs_clerk_user_id_idx').on(table.clerkUserId),
		timestampIdx: index('audit_logs_timestamp_idx').on(table.timestamp),
		eventIdx: index('audit_logs_event_idx').on(table.event),
	})
);

// Compliance Alerts Table
export const complianceAlerts = pgTable(
	'compliance_alerts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		type: varchar('type', {length: 50}).notNull(),
		title: varchar('title', {length: 255}).notNull(),
		description: text('description').notNull(),
		location: varchar('location', {length: 255}).notNull(),
		status: varchar('status', {length: 50}).notNull(),
		severity: varchar('severity', {length: 50}).notNull(),
		active: boolean('active').notNull(),
		createdAt: timestamp('created_at').notNull(),
		dismissedBy: varchar('dismissed_by', {length: 255}),
		dismissedAt: timestamp('dismissed_at'),
		metadata: jsonb('metadata').$type<{
			residentId?: string;
			shiftId?: string;
			logType?: string;
			expectedCount?: number;
			actualCount?: number;
		}>(),
	},
	(table) => ({
		statusIdx: index('compliance_alerts_status_idx').on(table.status),
		severityIdx: index('compliance_alerts_severity_idx').on(table.severity),
		locationIdx: index('compliance_alerts_location_idx').on(table.location),
		createdAtIdx: index('compliance_alerts_created_at_idx').on(table.createdAt),
	})
);

// ISP Files Table
export const ispFiles = pgTable(
	'isp_files',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		residentId: uuid('resident_id')
			.notNull()
			.references(() => residents.id, {onDelete: 'cascade'}),
		versionLabel: varchar('version_label', {length: 255}).notNull(),
		effectiveDate: timestamp('effective_date').notNull(),
		status: varchar('status', {length: 50}).notNull(),
		fileStorageId: varchar('file_storage_id', {length: 500}).notNull(),
		fileName: varchar('file_name', {length: 255}).notNull(),
		fileSize: integer('file_size').notNull(),
		contentType: varchar('content_type', {length: 100}).notNull(),
		preparedBy: varchar('prepared_by', {length: 255}),
		notes: text('notes'),
		uploadedBy: varchar('uploaded_by', {length: 255}).notNull(),
		uploadedAt: timestamp('uploaded_at').notNull(),
		activatedBy: varchar('activated_by', {length: 255}),
		activatedAt: timestamp('activated_at'),
		archivedBy: varchar('archived_by', {length: 255}),
		archivedAt: timestamp('archived_at'),
	},
	(table) => ({
		residentIdIdx: index('isp_files_resident_id_idx').on(table.residentId),
		statusIdx: index('isp_files_status_idx').on(table.status),
		effectiveDateIdx: index('isp_files_effective_date_idx').on(
			table.effectiveDate
		),
		residentVersionIdx: index('isp_files_resident_version_idx').on(
			table.residentId,
			table.versionLabel
		),
	})
);

// ISP Access Logs Table
export const ispAccessLogs = pgTable(
	'isp_access_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ispFileId: uuid('isp_file_id')
			.notNull()
			.references(() => ispFiles.id, {onDelete: 'cascade'}),
		residentId: uuid('resident_id')
			.notNull()
			.references(() => residents.id, {onDelete: 'cascade'}),
		clerkUserId: varchar('clerk_user_id', {length: 255}).notNull(),
		action: varchar('action', {length: 50}).notNull(),
		timestamp: timestamp('timestamp').notNull(),
		location: varchar('location', {length: 255}).notNull(),
		deviceId: varchar('device_id', {length: 255}).notNull(),
		ipAddress: varchar('ip_address', {length: 100}),
		userAgent: text('user_agent'),
		success: boolean('success').notNull(),
		errorMessage: text('error_message'),
	},
	(table) => ({
		ispFileIdIdx: index('isp_access_logs_isp_file_id_idx').on(table.ispFileId),
		residentIdIdx: index('isp_access_logs_resident_id_idx').on(
			table.residentId
		),
		clerkUserIdIdx: index('isp_access_logs_clerk_user_id_idx').on(
			table.clerkUserId
		),
		timestampIdx: index('isp_access_logs_timestamp_idx').on(table.timestamp),
		actionIdx: index('isp_access_logs_action_idx').on(table.action),
	})
);

// ISP Table
export const isp = pgTable(
	'isp',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		residentId: uuid('resident_id')
			.notNull()
			.references(() => residents.id, {onDelete: 'cascade'}),
		published: boolean('published'),
		content: text('content'),
		goals: jsonb('goals').$type<string[]>(),
		version: integer('version'),
		createdAt: timestamp('created_at').defaultNow(),
		dueAt: timestamp('due_at'),
	},
	(table) => ({
		residentIdIdx: index('isp_resident_id_idx').on(table.residentId),
	})
);

// ISP Acknowledgments Table
export const ispAcknowledgments = pgTable(
	'isp_acknowledgments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		residentId: uuid('resident_id')
			.notNull()
			.references(() => residents.id, {onDelete: 'cascade'}),
		clerkUserId: varchar('clerk_user_id', {length: 255}).notNull(),
		ispId: uuid('isp_id')
			.notNull()
			.references(() => isp.id, {onDelete: 'cascade'}),
		acknowledgedAt: timestamp('acknowledged_at').notNull(),
		acknowledgedIsp: uuid('acknowledged_isp')
			.notNull()
			.references(() => isp.id),
	},
	(table) => ({
		residentUserIdx: index('isp_acknowledgments_resident_user_idx').on(
			table.residentId,
			table.clerkUserId
		),
	})
);

// Fire Evac Table
export const fireEvac = pgTable(
	'fire_evac',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		residentId: uuid('resident_id')
			.notNull()
			.references(() => residents.id, {onDelete: 'cascade'}),
		location: varchar('location', {length: 255}),
		version: integer('version').notNull(),
		mobilityNeeds: text('mobility_needs'),
		assistanceRequired: text('assistance_required'),
		medicalEquipment: text('medical_equipment'),
		specialInstructions: text('special_instructions'),
		createdAt: timestamp('created_at').defaultNow(),
		createdBy: varchar('created_by', {length: 255}),
		fileStorageId: varchar('file_storage_id', {length: 500}),
		fileName: varchar('file_name', {length: 255}),
		fileSize: integer('file_size'),
		contentType: varchar('content_type', {length: 100}),
		notes: text('notes'),
	},
	(table) => ({
		residentIdIdx: index('fire_evac_resident_id_idx').on(table.residentId),
		locationIdx: index('fire_evac_location_idx').on(table.location),
	})
);

// Config Table
export const config = pgTable('config', {
	id: uuid('id').primaryKey().defaultRandom(),
	complianceReminderTemplate: text('compliance_reminder_template'),
	guardianInviteTemplate: text('guardian_invite_template'),
	alertWeekday: integer('alert_weekday'),
	alertHour: integer('alert_hour'),
	alertMinute: integer('alert_minute'),
	selfieEnforced: boolean('selfie_enforced'),
});

// Guardian Checklist Templates Table
export const guardianChecklistTemplates = pgTable(
	'guardian_checklist_templates',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: varchar('name', {length: 255}).notNull(),
		description: text('description'),
		questions: jsonb('questions')
			.$type<
				Array<{
					id: string;
					text: string;
					type: 'yes_no' | 'text' | 'rating';
					required: boolean;
				}>
			>()
			.notNull(),
		createdBy: varchar('created_by', {length: 255}).notNull(),
		createdAt: timestamp('created_at').notNull(),
		updatedAt: timestamp('updated_at'),
		updatedBy: varchar('updated_by', {length: 255}),
		active: boolean('active').notNull(),
	},
	(table) => ({
		activeIdx: index('guardian_checklist_templates_active_idx').on(
			table.active
		),
		createdByIdx: index('guardian_checklist_templates_created_by_idx').on(
			table.createdBy
		),
	})
);

// Guardian Checklist Links Table
export const guardianChecklistLinks = pgTable(
	'guardian_checklist_links',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		residentId: uuid('resident_id')
			.notNull()
			.references(() => residents.id, {onDelete: 'cascade'}),
		templateId: uuid('template_id')
			.notNull()
			.references(() => guardianChecklistTemplates.id, {onDelete: 'cascade'}),
		guardianEmail: varchar('guardian_email', {length: 255}).notNull(),
		token: varchar('token', {length: 255}).notNull(),
		sentDate: timestamp('sent_date').notNull(),
		sentBy: varchar('sent_by', {length: 255}),
		expiresAt: timestamp('expires_at').notNull(),
		completed: boolean('completed').notNull(),
		completedAt: timestamp('completed_at'),
		responses: jsonb('responses').$type<
			Array<{
				questionId: string;
				answer: string | number | boolean;
			}>
		>(),
	},
	(table) => ({
		tokenIdx: index('guardian_checklist_links_token_idx').on(table.token),
		residentIdIdx: index('guardian_checklist_links_resident_id_idx').on(
			table.residentId
		),
		sentByIdx: index('guardian_checklist_links_sent_by_idx').on(table.sentBy),
		completedIdx: index('guardian_checklist_links_completed_idx').on(
			table.completed
		),
	})
);

// Kiosk Pairing Tokens Table
export const kioskPairingTokens = pgTable(
	'kiosk_pairing_tokens',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		token: varchar('token', {length: 255}).notNull(),
		deviceId: varchar('device_id', {length: 255}).notNull(),
		location: varchar('location', {length: 255}).notNull(),
		deviceLabel: varchar('device_label', {length: 255}),
		status: varchar('status', {length: 50}).notNull(),
		issuedBy: varchar('issued_by', {length: 255}).notNull(),
		issuedAt: timestamp('issued_at').notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		usedAt: timestamp('used_at'),
	},
	(table) => ({
		tokenIdx: index('kiosk_pairing_tokens_token_idx').on(table.token),
		statusIdx: index('kiosk_pairing_tokens_status_idx').on(table.status),
	})
);

// Devices Table
export const devices = pgTable(
	'devices',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		deviceId: varchar('device_id', {length: 255}).notNull(),
		deviceName: varchar('device_name', {length: 255}).notNull(),
		location: varchar('location', {length: 255}).notNull(),
		isActive: boolean('is_active').notNull(),
		deviceType: varchar('device_type', {length: 50}),
		registeredBy: varchar('registered_by', {length: 255}).notNull(),
		registeredAt: timestamp('registered_at').notNull(),
		lastUsedAt: timestamp('last_used_at'),
		lastUsedBy: varchar('last_used_by', {length: 255}),
		metadata: jsonb('metadata').$type<{
			browser?: string;
			os?: string;
			screenResolution?: string;
			ipAddress?: string;
		}>(),
		notes: text('notes'),
	},
	(table) => ({
		deviceIdIdx: index('devices_device_id_idx').on(table.deviceId),
		locationIdx: index('devices_location_idx').on(table.location),
		isActiveIdx: index('devices_is_active_idx').on(table.isActive),
	})
);

// Users Table
export const users = pgTable(
	'users',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		clerkUserId: varchar('clerk_user_id', {length: 255}).notNull(),
		email: varchar('email', {length: 255}).notNull(),
		name: varchar('name', {length: 255}),
		lastLoginAt: timestamp('last_login_at'),
		lastLoginDeviceId: varchar('last_login_device_id', {length: 255}),
		lastLoginLocation: varchar('last_login_location', {length: 255}),
		createdAt: timestamp('created_at').notNull(),
		updatedAt: timestamp('updated_at'),
		resetToken: varchar('reset_token', {length: 255}),
		resetTokenExpiry: timestamp('reset_token_expiry'),
	},
	(table) => ({
		clerkUserIdIdx: index('users_clerk_user_id_idx').on(table.clerkUserId),
		emailIdx: index('users_email_idx').on(table.email),
		resetTokenIdx: index('users_reset_token_idx').on(table.resetToken),
	})
);

// Locations Table
export const locations = pgTable(
	'locations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: varchar('name', {length: 255}).notNull(),
		address: text('address'),
		phone: varchar('phone', {length: 50}),
		capacity: integer('capacity'),
		status: varchar('status', {length: 50}),
		createdBy: varchar('created_by', {length: 255}),
		createdAt: timestamp('created_at').defaultNow(),
		updatedAt: timestamp('updated_at'),
	},
	(table) => ({
		nameIdx: index('locations_name_idx').on(table.name),
	})
);

// HR Files Table
export const hrFiles = pgTable(
	'hr_files',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		employeeId: uuid('employee_id')
			.notNull()
			.references(() => employees.id, {onDelete: 'cascade'}),
		fileName: varchar('file_name', {length: 255}).notNull(),
		fileStorageId: varchar('file_storage_id', {length: 500}).notNull(),
		fileSize: integer('file_size').notNull(),
		contentType: varchar('content_type', {length: 100}).notNull(),
		uploadedBy: varchar('uploaded_by', {length: 255}).notNull(),
		uploadedAt: timestamp('uploaded_at').notNull(),
		archivedAt: timestamp('archived_at'),
		archivedBy: varchar('archived_by', {length: 255}),
	},
	(table) => ({
		employeeIdIdx: index('hr_files_employee_id_idx').on(table.employeeId),
	})
);

// HR File Logs Table
export const hrFileLogs = pgTable(
	'hr_file_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		clerkUserId: varchar('clerk_user_id', {length: 255}),
		hrFileId: uuid('hr_file_id')
			.notNull()
			.references(() => hrFiles.id, {onDelete: 'cascade'}),
		employeeId: uuid('employee_id')
			.notNull()
			.references(() => employees.id, {onDelete: 'cascade'}),
		action: varchar('action', {length: 50}).notNull(),
		timestamp: timestamp('timestamp').notNull(),
		success: boolean('success').notNull(),
		errorMessage: text('error_message'),
	},
	(table) => ({
		clerkUserIdIdx: index('hr_file_logs_clerk_user_id_idx').on(
			table.clerkUserId
		),
		hrFileIdIdx: index('hr_file_logs_hr_file_id_idx').on(table.hrFileId),
		employeeIdIdx: index('hr_file_logs_employee_id_idx').on(table.employeeId),
		timestampIdx: index('hr_file_logs_timestamp_idx').on(table.timestamp),
		actionIdx: index('hr_file_logs_action_idx').on(table.action),
	})
);

// Compliance Reminder Templates Table
export const complianceReminderTemplates = pgTable(
	'compliance_reminder_templates',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: varchar('name', {length: 255}).notNull(),
		type: varchar('type', {length: 50}).notNull(),
		subject: varchar('subject', {length: 500}).notNull(),
		body: text('body').notNull(),
		daysBeforeDue: integer('days_before_due').notNull(),
		active: boolean('active').notNull(),
		createdBy: uuid('created_by')
			.notNull()
			.references(() => users.id),
		createdAt: timestamp('created_at').notNull(),
		updatedAt: timestamp('updated_at'),
	},
	(table) => ({
		typeIdx: index('compliance_reminder_templates_type_idx').on(table.type),
		activeIdx: index('compliance_reminder_templates_active_idx').on(
			table.active
		),
	})
);

// Employee Training Documentation Table
export const employeeTrainings = pgTable(
	'employee_trainings',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		employeeId: uuid('employee_id')
			.notNull()
			.references(() => employees.id, {onDelete: 'cascade'}),
		trainingName: varchar('training_name', {length: 255}).notNull(),
		trainingYear: integer('training_year').notNull(),
		completed: boolean('completed').notNull().default(false),
		completedDate: timestamp('completed_date'),
		certificateFileId: varchar('certificate_file_id', {length: 255}),
		notes: text('notes'),
		createdAt: timestamp('created_at').defaultNow(),
		createdBy: varchar('created_by', {length: 255}),
		updatedAt: timestamp('updated_at'),
		updatedBy: varchar('updated_by', {length: 255}),
	},
	(table) => ({
		employeeIdIdx: index('employee_trainings_employee_id_idx').on(
			table.employeeId
		),
		yearIdx: index('employee_trainings_year_idx').on(table.trainingYear),
		completedIdx: index('employee_trainings_completed_idx').on(table.completed),
	})
);

// Enhanced Resident Log Activities Table (for checkboxes)
export const residentLogActivities = pgTable(
	'resident_log_activities',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		logId: uuid('log_id')
			.notNull()
			.references(() => residentLogs.id, {onDelete: 'cascade'}),
		activityType: varchar('activity_type', {length: 100}).notNull(), // 'took_meds', 'meal', 'bath', etc.
		completed: boolean('completed').notNull().default(false),
		notes: text('notes'),
		timestamp: timestamp('timestamp').defaultNow(),
	},
	(table) => ({
		logIdIdx: index('resident_log_activities_log_id_idx').on(table.logId),
		activityTypeIdx: index('resident_log_activities_activity_type_idx').on(
			table.activityType
		),
	})
);

// Generic Resident Documents Table
export const residentDocuments = pgTable(
	'resident_documents',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		residentId: uuid('resident_id')
			.notNull()
			.references(() => residents.id, {onDelete: 'cascade'}),
		title: varchar('title', {length: 255}).notNull(),
		type: varchar('type', {length: 50}).notNull(), // 'medical', 'consent', 'assessment', 'other'
		fileStorageId: varchar('file_storage_id', {length: 500}).notNull(),
		fileName: varchar('file_name', {length: 255}).notNull(),
		fileSize: integer('file_size').notNull(),
		contentType: varchar('content_type', {length: 100}).notNull(),
		description: text('description'),
		uploadedBy: varchar('uploaded_by', {length: 255}).notNull(),
		uploadedAt: timestamp('uploaded_at').defaultNow(),
	},
	(table) => ({
		residentIdIdx: index('resident_documents_resident_id_idx').on(
			table.residentId
		),
		typeIdx: index('resident_documents_type_idx').on(table.type),
	})
);

// Smoke Detector Checks (monthly)
export const smokeDetectorChecks = pgTable(
	'smoke_detector_checks',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		location: varchar('location', {length: 255}).notNull(),
		date: timestamp('date').notNull(),
		smokeStatus: varchar('smoke_status', {length: 50}).notNull(),
		coStatus: varchar('co_status', {length: 50}).notNull(),
		staffInitials: varchar('staff_initials', {length: 50}).notNull(),
		notes: text('notes'),
		createdBy: varchar('created_by', {length: 255}).notNull(),
		updatedBy: varchar('updated_by', {length: 255}),
		createdAt: timestamp('created_at').defaultNow(),
		updatedAt: timestamp('updated_at'),
	},
	(table) => ({
		locationIdx: index('smoke_detector_checks_location_idx').on(table.location),
		dateIdx: index('smoke_detector_checks_date_idx').on(table.date),
	})
);

// Fire Drills (semiannual)
export const fireDrills = pgTable(
	'fire_drills',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		location: varchar('location', {length: 255}).notNull(),
		year: integer('year').notNull(),
		sequence: integer('sequence').notNull(), // 1 or 2 for 1st/2nd
		residentName: varchar('resident_name', {length: 255}).notNull(),
		date: timestamp('date').notNull(),
		time: varchar('time', {length: 50}).notNull(),
		staffName: varchar('staff_name', {length: 255}).notNull(),
		comment: text('comment'),
		createdBy: varchar('created_by', {length: 255}).notNull(),
		updatedBy: varchar('updated_by', {length: 255}),
		createdAt: timestamp('created_at').defaultNow(),
		updatedAt: timestamp('updated_at'),
	},
	(table) => ({
		locationIdx: index('fire_drills_location_idx').on(table.location),
		yearIdx: index('fire_drills_year_idx').on(table.year),
		sequenceIdx: index('fire_drills_sequence_idx').on(table.sequence),
	})
);

// Inspector Access Table
// One-time-password grants that let a state inspector view a location's
// compliance data through a read-only dashboard, without a Clerk account.
export const inspectorAccess = pgTable(
	'inspector_access',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		location: varchar('location', {length: 255}).notNull(),
		label: varchar('label', {length: 255}), // e.g. inspector name / purpose
		otpHash: varchar('otp_hash', {length: 255}).notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		createdBy: varchar('created_by', {length: 255}).notNull(),
		createdByName: varchar('created_by_name', {length: 255}),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		revokedAt: timestamp('revoked_at'),
		revokedBy: varchar('revoked_by', {length: 255}),
		lastAccessedAt: timestamp('last_accessed_at'),
	},
	(table) => ({
		otpHashIdx: index('inspector_access_otp_hash_idx').on(table.otpHash),
		locationIdx: index('inspector_access_location_idx').on(table.location),
		expiresAtIdx: index('inspector_access_expires_at_idx').on(table.expiresAt),
	})
);

// Incident Reports Table
export const incidentReports = pgTable(
	'incident_reports',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		residentId: uuid('resident_id')
			.notNull()
			.references(() => residents.id, {onDelete: 'cascade'}),
		reportedBy: varchar('reported_by', {length: 255}).notNull(), // Clerk User ID
		reportedByName: varchar('reported_by_name', {length: 255}),
		incidentDate: timestamp('incident_date').notNull(),
		incidentType: varchar('incident_type', {length: 100}).notNull(), // 'medical', 'behavioral', 'safety', 'other'
		severity: varchar('severity', {length: 50}).notNull(), // 'low', 'medium', 'high', 'critical'
		location: varchar('location', {length: 255}).notNull(),
		description: text('description').notNull(),
		actionTaken: text('action_taken'),
		witnessNames: text('witness_names'),
		followUpRequired: boolean('follow_up_required').default(false),
		followUpNotes: text('follow_up_notes'),
		attachments: jsonb('attachments').$type<string[]>(), // Array of file IDs
		createdAt: timestamp('created_at').defaultNow(),
		updatedAt: timestamp('updated_at'),
	},
	(table) => ({
		residentIdIdx: index('incident_reports_resident_id_idx').on(
			table.residentId
		),
		reportedByIdx: index('incident_reports_reported_by_idx').on(
			table.reportedBy
		),
		incidentDateIdx: index('incident_reports_incident_date_idx').on(
			table.incidentDate
		),
		severityIdx: index('incident_reports_severity_idx').on(table.severity),
	})
);

// ============================
// RELATIONS (Drizzle ORM)
// ============================

export const residentsRelations = relations(residents, ({many}) => ({
	logs: many(residentLogs),
	ispFiles: many(ispFiles),
	isp: many(isp),
	fireEvac: many(fireEvac),
	guardianChecklistLinks: many(guardianChecklistLinks),
	ispAccessLogs: many(ispAccessLogs),
	ispAcknowledgments: many(ispAcknowledgments),
	incidentReports: many(incidentReports),
	documents: many(residentDocuments),
}));

export const employeesRelations = relations(employees, ({many}) => ({
	hrFiles: many(hrFiles),
	hrFileLogs: many(hrFileLogs),
	trainings: many(employeeTrainings),
}));

export const shiftsRelations = relations(shifts, ({one, many}) => ({
	kiosk: one(kiosks, {
		fields: [shifts.kioskId],
		references: [kiosks.id],
	}),
	residentLogs: many(residentLogs),
}));

export const residentLogsRelations = relations(residentLogs, ({one, many}) => ({
	resident: one(residents, {
		fields: [residentLogs.residentId],
		references: [residents.id],
	}),
	shift: one(shifts, {
		fields: [residentLogs.shiftId],
		references: [shifts.id],
	}),
	activities: many(residentLogActivities),
}));

export const ispFilesRelations = relations(ispFiles, ({one, many}) => ({
	resident: one(residents, {
		fields: [ispFiles.residentId],
		references: [residents.id],
	}),
	accessLogs: many(ispAccessLogs),
}));

export const ispAccessLogsRelations = relations(ispAccessLogs, ({one}) => ({
	ispFile: one(ispFiles, {
		fields: [ispAccessLogs.ispFileId],
		references: [ispFiles.id],
	}),
	resident: one(residents, {
		fields: [ispAccessLogs.residentId],
		references: [residents.id],
	}),
}));

export const ispRelations = relations(isp, ({one, many}) => ({
	resident: one(residents, {
		fields: [isp.residentId],
		references: [residents.id],
	}),
	acknowledgments: many(ispAcknowledgments),
}));

export const ispAcknowledgmentsRelations = relations(
	ispAcknowledgments,
	({one}) => ({
		resident: one(residents, {
			fields: [ispAcknowledgments.residentId],
			references: [residents.id],
		}),
		isp: one(isp, {
			fields: [ispAcknowledgments.ispId],
			references: [isp.id],
		}),
	})
);

export const fireEvacRelations = relations(fireEvac, ({one}) => ({
	resident: one(residents, {
		fields: [fireEvac.residentId],
		references: [residents.id],
	}),
}));

export const guardianChecklistLinksRelations = relations(
	guardianChecklistLinks,
	({one}) => ({
		resident: one(residents, {
			fields: [guardianChecklistLinks.residentId],
			references: [residents.id],
		}),
		template: one(guardianChecklistTemplates, {
			fields: [guardianChecklistLinks.templateId],
			references: [guardianChecklistTemplates.id],
		}),
	})
);

export const guardianChecklistTemplatesRelations = relations(
	guardianChecklistTemplates,
	({many}) => ({
		links: many(guardianChecklistLinks),
	})
);

export const hrFilesRelations = relations(hrFiles, ({one, many}) => ({
	employee: one(employees, {
		fields: [hrFiles.employeeId],
		references: [employees.id],
	}),
	logs: many(hrFileLogs),
}));

export const hrFileLogsRelations = relations(hrFileLogs, ({one}) => ({
	hrFile: one(hrFiles, {
		fields: [hrFileLogs.hrFileId],
		references: [hrFiles.id],
	}),
	employee: one(employees, {
		fields: [hrFileLogs.employeeId],
		references: [employees.id],
	}),
}));

export const complianceReminderTemplatesRelations = relations(
	complianceReminderTemplates,
	({one}) => ({
		createdByUser: one(users, {
			fields: [complianceReminderTemplates.createdBy],
			references: [users.id],
		}),
	})
);

export const employeeTrainingsRelations = relations(
	employeeTrainings,
	({one}) => ({
		employee: one(employees, {
			fields: [employeeTrainings.employeeId],
			references: [employees.id],
		}),
	})
);

export const residentLogActivitiesRelations = relations(
	residentLogActivities,
	({one}) => ({
		log: one(residentLogs, {
			fields: [residentLogActivities.logId],
			references: [residentLogs.id],
		}),
	})
);

export const incidentReportsRelations = relations(incidentReports, ({one}) => ({
	resident: one(residents, {
		fields: [incidentReports.residentId],
		references: [residents.id],
	}),
}));

// Memos Table
export const memos = pgTable(
	'memos',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		title: varchar('title', {length: 255}).notNull(),
		content: text('content').notNull(),
		senderClerkUserId: varchar('sender_clerk_user_id', {length: 255}).notNull(),
		senderName: varchar('sender_name', {length: 255}).notNull(),
		recipientType: varchar('recipient_type', {length: 50}).notNull(), // 'location', 'all-staff', 'all-supervisors', 'all-employees', 'selected-locations', 'selected-users'
		targetLocations: jsonb('target_locations').$type<string[]>().default([]),
		targetUsers: jsonb('target_users').$type<string[]>().default([]), // clerk user IDs
		priority: varchar('priority', {length: 20}).default('normal'), // 'normal', 'high', 'urgent'
		expiresAt: timestamp('expires_at'),
		createdAt: timestamp('created_at').defaultNow(),
		updatedAt: timestamp('updated_at'),
	},
	(table) => ({
		senderIdx: index('memos_sender_idx').on(table.senderClerkUserId),
		createdAtIdx: index('memos_created_at_idx').on(table.createdAt),
		recipientTypeIdx: index('memos_recipient_type_idx').on(table.recipientType),
	})
);

// Memos Read Tracking Table
export const memosRead = pgTable(
	'memos_read',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		memoId: uuid('memo_id').notNull().references(() => memos.id, {onDelete: 'cascade'}),
		clerkUserId: varchar('clerk_user_id', {length: 255}).notNull(),
		readAt: timestamp('read_at').defaultNow(),
	},
	(table) => ({
		memoIdIdx: index('memos_read_memo_id_idx').on(table.memoId),
		userIdIdx: index('memos_read_user_id_idx').on(table.clerkUserId),
	})
);

// Vacation Requests Table
export const vacationRequests = pgTable(
	'vacation_requests',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		employeeClerkUserId: varchar('employee_clerk_user_id', {length: 255}).notNull(),
		employeeName: varchar('employee_name', {length: 255}).notNull(),
		startDate: timestamp('start_date').notNull(),
		endDate: timestamp('end_date').notNull(),
		reason: text('reason'),
		status: varchar('status', {length: 20}).default('pending').notNull(), // 'pending', 'approved', 'denied'
		adminComments: text('admin_comments'),
		adminClerkUserId: varchar('admin_clerk_user_id', {length: 255}),
		adminName: varchar('admin_name', {length: 255}),
		respondedAt: timestamp('responded_at'),
		createdAt: timestamp('created_at').defaultNow(),
		updatedAt: timestamp('updated_at').defaultNow(),
	},
	(table) => ({
		employeeIdx: index('vacation_requests_employee_idx').on(table.employeeClerkUserId),
		statusIdx: index('vacation_requests_status_idx').on(table.status),
		startDateIdx: index('vacation_requests_start_date_idx').on(table.startDate),
	})
);
