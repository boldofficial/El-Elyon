import {
	pgTable,
	text,
	varchar,
	integer,
	timestamp,
	boolean,
	jsonb,
	index,
	uniqueIndex,
	check,
	uuid,
	date,
	time
} from 'drizzle-orm/pg-core';
import {relations, sql} from 'drizzle-orm';

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
		createdBy: varchar('created_by', {length: 255})
	},
	(table) => ({
		locationIdx: index('residents_location_idx').on(table.location),
		createdByIdx: index('residents_created_by_idx').on(table.createdBy)
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
		createdBy: varchar('created_by', {length: 255})
	},
	(table) => ({
		createdByIdx: index('guardians_created_by_idx').on(table.createdBy)
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
		inviteResent: integer('invite_resent')
	},
	(table) => ({
		workEmailIdx: index('employees_work_email_idx').on(table.workEmail),
		emailIdx: index('employees_email_idx').on(table.email),
		clerkUserIdIdx: index('employees_clerk_user_id_idx').on(table.clerkUserId),
		assignedDeviceIdIdx: index('employees_assigned_device_id_idx').on(
			table.assignedDeviceId
		),
		inviteTokenIdx: index('employees_invite_token_idx').on(table.inviteToken)
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
		teams: jsonb('teams').$type<string[]>()
	},
	(table) => ({
		clerkUserIdIdx: index('roles_clerk_user_id_idx').on(table.clerkUserId)
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
		revokedAt: timestamp('revoked_at')
	},
	(table) => ({
		clerkUserIdIdx: index('admin_privileges_clerk_user_id_idx').on(
			table.clerkUserId
		),
		activeIdx: index('admin_privileges_active_idx').on(
			table.clerkUserId,
			table.privilege
		)
	})
);

// Shifts Table
// locationId/shiftSlot/operationalDate/operationalTimeZoneSnapshot are nullable
// for backward compatibility with shifts that predate the daily water-temperature
// check feature. Post-cutover clock-ins are expected to populate all four
// together (enforced at the application layer in later units); the DB-level
// identityCompletenessCheck only guards against a partially-populated identity.
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
		locationId: uuid('location_id').references(() => locations.id, {
			onDelete: 'restrict'
		}),
		shiftSlot: integer('shift_slot'),
		operationalDate: date('operational_date', {mode: 'string'}),
		operationalTimeZoneSnapshot: varchar('operational_time_zone_snapshot', {
			length: 100
		})
	},
	(table) => ({
		clerkUserIdIdx: index('shifts_clerk_user_id_idx').on(table.clerkUserId),
		locationIdx: index('shifts_location_idx').on(table.location),
		clockInTimeIdx: index('shifts_clock_in_time_idx').on(table.clockInTime),
		locationIdIdx: index('shifts_location_id_idx').on(table.locationId),
		operationalDateIdx: index('shifts_operational_date_idx').on(
			table.locationId,
			table.operationalDate
		),
		shiftSlotCheck: check(
			'shifts_shift_slot_check',
			sql`${table.shiftSlot} is null or ${table.shiftSlot} in (1, 2, 3)`
		),
		identityCompletenessCheck: check(
			'shifts_identity_completeness_check',
			sql`(
				${table.locationId} is null and ${table.shiftSlot} is null and
				${table.operationalDate} is null and ${table.operationalTimeZoneSnapshot} is null
			) or (
				${table.locationId} is not null and ${table.shiftSlot} is not null and
				${table.operationalDate} is not null and ${table.operationalTimeZoneSnapshot} is not null
			)`
		)
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
		createdBy: varchar('created_by', {length: 255})
	},
	(table) => ({
		locationIdx: index('kiosks_location_idx').on(table.location),
		deviceIdIdx: index('kiosks_device_id_idx').on(table.deviceId)
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
		createdAt: timestamp('created_at').defaultNow()
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
		createdAtIdx: index('resident_logs_created_at_idx').on(table.createdAt)
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
		details: text('details')
	},
	(table) => ({
		clerkUserIdIdx: index('audit_logs_clerk_user_id_idx').on(table.clerkUserId),
		timestampIdx: index('audit_logs_timestamp_idx').on(table.timestamp),
		eventIdx: index('audit_logs_event_idx').on(table.event)
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
		}>()
	},
	(table) => ({
		statusIdx: index('compliance_alerts_status_idx').on(table.status),
		severityIdx: index('compliance_alerts_severity_idx').on(table.severity),
		locationIdx: index('compliance_alerts_location_idx').on(table.location),
		createdAtIdx: index('compliance_alerts_created_at_idx').on(table.createdAt)
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
		archivedAt: timestamp('archived_at')
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
		)
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
		errorMessage: text('error_message')
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
		actionIdx: index('isp_access_logs_action_idx').on(table.action)
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
		dueAt: timestamp('due_at')
	},
	(table) => ({
		residentIdIdx: index('isp_resident_id_idx').on(table.residentId)
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
			.references(() => isp.id)
	},
	(table) => ({
		residentUserIdx: index('isp_acknowledgments_resident_user_idx').on(
			table.residentId,
			table.clerkUserId
		)
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
		notes: text('notes')
	},
	(table) => ({
		residentIdIdx: index('fire_evac_resident_id_idx').on(table.residentId),
		locationIdx: index('fire_evac_location_idx').on(table.location)
	})
);

// Config Table
export const config = pgTable(
	'config',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		complianceReminderTemplate: text('compliance_reminder_template'),
		guardianInviteTemplate: text('guardian_invite_template'),
		alertWeekday: integer('alert_weekday'),
		alertHour: integer('alert_hour'),
		alertMinute: integer('alert_minute'),
		selfieEnforced: boolean('selfie_enforced'),
		// Canonical organization-local timezone used to freeze operational dates
		// for shifts and water-temperature checks (see KTD2 in the daily
		// water-temperature checks plan). IANA validity is enforced in
		// lib/water-temperature.ts, not at the database level.
		operationalTimeZone: varchar('operational_time_zone', {length: 100})
			.notNull()
			.default('America/Chicago')
	},
	(table) => ({
		operationalTimeZoneCheck: check(
			'config_operational_time_zone_check',
			sql`length(btrim(${table.operationalTimeZone})) > 0`
		)
	})
);

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
		active: boolean('active').notNull()
	},
	(table) => ({
		activeIdx: index('guardian_checklist_templates_active_idx').on(
			table.active
		),
		createdByIdx: index('guardian_checklist_templates_created_by_idx').on(
			table.createdBy
		)
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
		>()
	},
	(table) => ({
		tokenIdx: index('guardian_checklist_links_token_idx').on(table.token),
		residentIdIdx: index('guardian_checklist_links_resident_id_idx').on(
			table.residentId
		),
		sentByIdx: index('guardian_checklist_links_sent_by_idx').on(table.sentBy),
		completedIdx: index('guardian_checklist_links_completed_idx').on(
			table.completed
		)
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
		usedAt: timestamp('used_at')
	},
	(table) => ({
		tokenIdx: index('kiosk_pairing_tokens_token_idx').on(table.token),
		statusIdx: index('kiosk_pairing_tokens_status_idx').on(table.status)
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
		notes: text('notes')
	},
	(table) => ({
		deviceIdIdx: index('devices_device_id_idx').on(table.deviceId),
		locationIdx: index('devices_location_idx').on(table.location),
		isActiveIdx: index('devices_is_active_idx').on(table.isActive)
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
		resetTokenExpiry: timestamp('reset_token_expiry')
	},
	(table) => ({
		clerkUserIdIdx: index('users_clerk_user_id_idx').on(table.clerkUserId),
		emailIdx: index('users_email_idx').on(table.email),
		resetTokenIdx: index('users_reset_token_idx').on(table.resetToken)
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
		updatedAt: timestamp('updated_at')
	},
	(table) => ({
		nameIdx: index('locations_name_idx').on(table.name)
	})
);

export const locationLegacyNames = pgTable(
	'location_legacy_names',
	{
		locationId: uuid('location_id')
			.notNull()
			.references(() => locations.id, {onDelete: 'cascade'}),
		name: varchar('name', {length: 255}).notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(table) => ({
		locationIdx: index('location_legacy_names_location_id_idx').on(
			table.locationId
		),
		nameIdx: index('location_legacy_names_name_idx').on(table.name),
		locationNameUidx: uniqueIndex(
			'location_legacy_names_location_id_name_uidx'
		).on(table.locationId, table.name)
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
		archivedBy: varchar('archived_by', {length: 255})
	},
	(table) => ({
		employeeIdIdx: index('hr_files_employee_id_idx').on(table.employeeId)
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
		errorMessage: text('error_message')
	},
	(table) => ({
		clerkUserIdIdx: index('hr_file_logs_clerk_user_id_idx').on(
			table.clerkUserId
		),
		hrFileIdIdx: index('hr_file_logs_hr_file_id_idx').on(table.hrFileId),
		employeeIdIdx: index('hr_file_logs_employee_id_idx').on(table.employeeId),
		timestampIdx: index('hr_file_logs_timestamp_idx').on(table.timestamp),
		actionIdx: index('hr_file_logs_action_idx').on(table.action)
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
		updatedAt: timestamp('updated_at')
	},
	(table) => ({
		typeIdx: index('compliance_reminder_templates_type_idx').on(table.type),
		activeIdx: index('compliance_reminder_templates_active_idx').on(
			table.active
		)
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
		updatedBy: varchar('updated_by', {length: 255})
	},
	(table) => ({
		employeeIdIdx: index('employee_trainings_employee_id_idx').on(
			table.employeeId
		),
		yearIdx: index('employee_trainings_year_idx').on(table.trainingYear),
		completedIdx: index('employee_trainings_completed_idx').on(table.completed)
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
		timestamp: timestamp('timestamp').defaultNow()
	},
	(table) => ({
		logIdIdx: index('resident_log_activities_log_id_idx').on(table.logId),
		activityTypeIdx: index('resident_log_activities_activity_type_idx').on(
			table.activityType
		)
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
		uploadedAt: timestamp('uploaded_at').defaultNow()
	},
	(table) => ({
		residentIdIdx: index('resident_documents_resident_id_idx').on(
			table.residentId
		),
		typeIdx: index('resident_documents_type_idx').on(table.type)
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
		updatedAt: timestamp('updated_at')
	},
	(table) => ({
		locationIdx: index('smoke_detector_checks_location_idx').on(table.location),
		dateIdx: index('smoke_detector_checks_date_idx').on(table.date)
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
		updatedAt: timestamp('updated_at')
	},
	(table) => ({
		locationIdx: index('fire_drills_location_idx').on(table.location),
		yearIdx: index('fire_drills_year_idx').on(table.year),
		sequenceIdx: index('fire_drills_sequence_idx').on(table.sequence)
	})
);

// Life-safety reporting v2. These normalized tables intentionally coexist with
// smokeDetectorChecks and fireDrills so ambiguous legacy records remain intact.
export const lifeSafetyInspectionEntries = pgTable(
	'life_safety_inspection_entries',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		locationId: uuid('location_id')
			.notNull()
			.references(() => locations.id, {onDelete: 'restrict'}),
		houseNameSnapshot: varchar('house_name_snapshot', {
			length: 255
		}).notNull(),
		reportYear: integer('report_year').notNull(),
		reportMonth: integer('report_month').notNull(),
		equipmentType: varchar('equipment_type', {length: 32}).notNull(),
		inspectionDate: date('inspection_date', {mode: 'string'}).notNull(),
		staffInitials: varchar('staff_initials', {length: 50}).notNull(),
		outcome: varchar('outcome', {length: 20}).notNull(),
		notes: text('notes'),
		version: integer('version').notNull().default(1),
		voidedAt: timestamp('voided_at'),
		voidedBy: varchar('voided_by', {length: 255}),
		voidReason: text('void_reason'),
		createdBy: varchar('created_by', {length: 255}).notNull(),
		updatedBy: varchar('updated_by', {length: 255}),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at')
	},
	(table) => ({
		locationYearIdx: index(
			'life_safety_inspection_entries_location_year_idx'
		).on(table.locationId, table.reportYear),
		activeIdentityIdx: uniqueIndex(
			'life_safety_inspection_entries_active_identity_uidx'
		)
			.on(
				table.locationId,
				table.reportYear,
				table.reportMonth,
				table.equipmentType
			)
			.where(sql`${table.voidedAt} is null`),
		yearCheck: check(
			'life_safety_inspection_entries_year_check',
			sql`${table.reportYear} between 2020 and 2100`
		),
		monthCheck: check(
			'life_safety_inspection_entries_month_check',
			sql`${table.reportMonth} between 1 and 12`
		),
		equipmentCheck: check(
			'life_safety_inspection_entries_equipment_check',
			sql`${table.equipmentType} in ('smoke', 'carbon_monoxide', 'fire_extinguisher')`
		),
		dateIdentityCheck: check(
			'life_safety_inspection_entries_date_identity_check',
			sql`extract(year from ${table.inspectionDate}) = ${table.reportYear} and extract(month from ${table.inspectionDate}) = ${table.reportMonth}`
		),
		outcomeCheck: check(
			'life_safety_inspection_entries_outcome_check',
			sql`${table.outcome} in ('pass', 'fail')`
		),
		versionCheck: check(
			'life_safety_inspection_entries_version_check',
			sql`${table.version} >= 1`
		),
		snapshotCheck: check(
			'life_safety_inspection_entries_snapshot_check',
			sql`length(btrim(${table.houseNameSnapshot})) > 0 and length(btrim(${table.staffInitials})) > 0`
		),
		voidCheck: check(
			'life_safety_inspection_entries_void_check',
			sql`(${table.voidedAt} is null and ${table.voidedBy} is null and ${table.voidReason} is null) or (${table.voidedAt} is not null and ${table.voidedBy} is not null and coalesce(length(btrim(${table.voidReason})), 0) > 0)`
		)
	})
);

export const fireDrillReports = pgTable(
	'fire_drill_reports',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		locationId: uuid('location_id')
			.notNull()
			.references(() => locations.id, {onDelete: 'restrict'}),
		houseNameSnapshot: varchar('house_name_snapshot', {
			length: 255
		}).notNull(),
		reportYear: integer('report_year').notNull(),
		sequence: integer('sequence').notNull(),
		drillDate: date('drill_date', {mode: 'string'}).notNull(),
		drillTime: time('drill_time', {precision: 0}).notNull(),
		staffNames: jsonb('staff_names').$type<string[]>().notNull(),
		version: integer('version').notNull().default(1),
		voidedAt: timestamp('voided_at'),
		voidedBy: varchar('voided_by', {length: 255}),
		voidReason: text('void_reason'),
		createdBy: varchar('created_by', {length: 255}).notNull(),
		updatedBy: varchar('updated_by', {length: 255}),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at')
	},
	(table) => ({
		locationYearIdx: index('fire_drill_reports_location_year_idx').on(
			table.locationId,
			table.reportYear
		),
		activeIdentityIdx: uniqueIndex('fire_drill_reports_active_identity_uidx')
			.on(table.locationId, table.reportYear, table.sequence)
			.where(sql`${table.voidedAt} is null`),
		yearCheck: check(
			'fire_drill_reports_year_check',
			sql`${table.reportYear} between 2020 and 2100`
		),
		sequenceCheck: check(
			'fire_drill_reports_sequence_check',
			sql`${table.sequence} in (1, 2)`
		),
		dateIdentityCheck: check(
			'fire_drill_reports_date_identity_check',
			sql`extract(year from ${table.drillDate}) = ${table.reportYear}`
		),
		staffNamesCheck: check(
			'fire_drill_reports_staff_names_check',
			sql`case when jsonb_typeof(${table.staffNames}) = 'array' then jsonb_array_length(${table.staffNames}) between 1 and 24 and not jsonb_path_exists(${table.staffNames}, '$[*] ? (@.type() != "string" || @ == "")') else false end`
		),
		versionCheck: check(
			'fire_drill_reports_version_check',
			sql`${table.version} >= 1`
		),
		snapshotCheck: check(
			'fire_drill_reports_snapshot_check',
			sql`length(btrim(${table.houseNameSnapshot})) > 0`
		),
		voidCheck: check(
			'fire_drill_reports_void_check',
			sql`(${table.voidedAt} is null and ${table.voidedBy} is null and ${table.voidReason} is null) or (${table.voidedAt} is not null and ${table.voidedBy} is not null and coalesce(length(btrim(${table.voidReason})), 0) > 0)`
		)
	})
);

export const fireDrillParticipants = pgTable(
	'fire_drill_participants',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		fireDrillReportId: uuid('fire_drill_report_id')
			.notNull()
			.references(() => fireDrillReports.id, {onDelete: 'cascade'}),
		residentId: uuid('resident_id').references(() => residents.id, {
			onDelete: 'set null'
		}),
		residentNameSnapshot: varchar('resident_name_snapshot', {
			length: 255
		}).notNull(),
		participantSource: varchar('participant_source', {length: 20}).notNull(),
		durationMinutes: integer('duration_minutes'),
		durationSeconds: integer('duration_seconds'),
		comment: text('comment'),
		position: integer('position').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(table) => ({
		reportIdx: index('fire_drill_participants_report_idx').on(
			table.fireDrillReportId
		),
		positionIdx: uniqueIndex('fire_drill_participants_position_uidx').on(
			table.fireDrillReportId,
			table.position
		),
		residentIdx: uniqueIndex('fire_drill_participants_resident_uidx')
			.on(table.fireDrillReportId, table.residentId)
			.where(sql`${table.residentId} is not null`),
		sourceCheck: check(
			'fire_drill_participants_source_check',
			sql`${table.participantSource} in ('roster', 'manual', 'external')`
		),
		sourceReferenceCheck: check(
			'fire_drill_participants_source_reference_check',
			sql`(${table.participantSource} = 'roster' and ${table.residentId} is not null) or (${table.participantSource} in ('manual', 'external') and ${table.residentId} is null)`
		),
		durationCheck: check(
			'fire_drill_participants_duration_check',
			sql`(${table.durationMinutes} is not null and ${table.durationMinutes} between 0 and 2147483647 and ${table.durationSeconds} between 0 and 59) or (${table.durationMinutes} is null and ${table.durationSeconds} is null and coalesce(length(btrim(${table.comment})), 0) > 0)`
		),
		positionCheck: check(
			'fire_drill_participants_position_check',
			sql`${table.position} between 0 and 63`
		),
		snapshotCheck: check(
			'fire_drill_participants_snapshot_check',
			sql`length(btrim(${table.residentNameSnapshot})) > 0`
		)
	})
);

export const lifeSafetyReportRevisions = pgTable(
	'life_safety_report_revisions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		inspectionEntryId: uuid('inspection_entry_id').references(
			() => lifeSafetyInspectionEntries.id,
			{onDelete: 'restrict'}
		),
		fireDrillReportId: uuid('fire_drill_report_id').references(
			() => fireDrillReports.id,
			{
				onDelete: 'restrict'
			}
		),
		entityType: varchar('entity_type', {length: 20}).notNull(),
		version: integer('version').notNull(),
		action: varchar('action', {length: 20}).notNull(),
		snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
		reason: text('reason'),
		actorId: varchar('actor_id', {length: 255}).notNull(),
		actorNameSnapshot: varchar('actor_name_snapshot', {length: 255}),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(table) => ({
		inspectionVersionIdx: uniqueIndex(
			'life_safety_report_revisions_inspection_version_uidx'
		)
			.on(table.inspectionEntryId, table.version)
			.where(sql`${table.inspectionEntryId} is not null`),
		drillVersionIdx: uniqueIndex(
			'life_safety_report_revisions_drill_version_uidx'
		)
			.on(table.fireDrillReportId, table.version)
			.where(sql`${table.fireDrillReportId} is not null`),
		entityCheck: check(
			'life_safety_report_revisions_entity_check',
			sql`(${table.entityType} = 'inspection' and ${table.inspectionEntryId} is not null and ${table.fireDrillReportId} is null) or (${table.entityType} = 'fire_drill' and ${table.fireDrillReportId} is not null and ${table.inspectionEntryId} is null)`
		),
		versionCheck: check(
			'life_safety_report_revisions_version_check',
			sql`${table.version} >= 1`
		),
		actionCheck: check(
			'life_safety_report_revisions_action_check',
			sql`${table.action} in ('create', 'correct', 'move', 'void')`
		),
		snapshotCheck: check(
			'life_safety_report_revisions_snapshot_check',
			sql`jsonb_typeof(${table.snapshot}) = 'object'`
		)
	})
);

// Daily water-temperature checks. One non-voided record exists per
// (locationId, operationalDate, shiftSlot); staff append-only add rechecks and
// actions, while supervisors/admins may append reasoned corrections/voids that
// are captured in waterTemperatureCheckRevisions. Kitchen/bath readings are
// stored as integer tenths-of-a-degree Fahrenheit (e.g. 1180 = 118.0F) to avoid
// binary-floating-point comparisons; see lib/water-temperature.ts.
export const waterTemperatureChecks = pgTable(
	'water_temperature_checks',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		locationId: uuid('location_id')
			.notNull()
			.references(() => locations.id, {onDelete: 'restrict'}),
		houseNameSnapshot: varchar('house_name_snapshot', {
			length: 255
		}).notNull(),
		operationalDate: date('operational_date', {mode: 'string'}).notNull(),
		shiftSlot: integer('shift_slot').notNull(),
		shiftId: uuid('shift_id').references(() => shifts.id, {
			onDelete: 'set null'
		}),
		kitchenTempTenths: integer('kitchen_temp_tenths').notNull(),
		bathTempTenths: integer('bath_temp_tenths').notNull(),
		staffId: varchar('staff_id', {length: 255}).notNull(),
		staffNameSnapshot: varchar('staff_name_snapshot', {
			length: 255
		}).notNull(),
		staffInitialsSnapshot: varchar('staff_initials_snapshot', {
			length: 10
		}).notNull(),
		observedAt: timestamp('observed_at').notNull(),
		comments: text('comments'),
		action: text('action'),
		state: varchar('state', {length: 30}).notNull(),
		version: integer('version').notNull().default(1),
		voidedAt: timestamp('voided_at'),
		voidedBy: varchar('voided_by', {length: 255}),
		voidReason: text('void_reason'),
		createdBy: varchar('created_by', {length: 255}).notNull(),
		updatedBy: varchar('updated_by', {length: 255}),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at')
	},
	(table) => ({
		locationDateIdx: index('water_temperature_checks_location_date_idx').on(
			table.locationId,
			table.operationalDate
		),
		shiftIdIdx: index('water_temperature_checks_shift_id_idx').on(
			table.shiftId
		),
		activeIdentityIdx: uniqueIndex(
			'water_temperature_checks_active_identity_uidx'
		)
			.on(table.locationId, table.operationalDate, table.shiftSlot)
			.where(sql`${table.voidedAt} is null`),
		shiftSlotCheck: check(
			'water_temperature_checks_shift_slot_check',
			sql`${table.shiftSlot} in (1, 2, 3)`
		),
		kitchenTempCheck: check(
			'water_temperature_checks_kitchen_temp_check',
			sql`${table.kitchenTempTenths} between 0 and 2500`
		),
		bathTempCheck: check(
			'water_temperature_checks_bath_temp_check',
			sql`${table.bathTempTenths} between 0 and 2500`
		),
		stateCheck: check(
			'water_temperature_checks_state_check',
			sql`${table.state} in ('complete', 'complete_with_attention', 'action_required', 'recheck_required')`
		),
		versionCheck: check(
			'water_temperature_checks_version_check',
			sql`${table.version} >= 1`
		),
		snapshotCheck: check(
			'water_temperature_checks_snapshot_check',
			sql`length(btrim(${table.houseNameSnapshot})) > 0 and length(btrim(${table.staffNameSnapshot})) > 0 and length(btrim(${table.staffInitialsSnapshot})) > 0 and length(btrim(${table.staffId})) > 0`
		),
		actionRequiredCheck: check(
			'water_temperature_checks_action_required_check',
			sql`${table.state} not in ('action_required', 'recheck_required') or (${table.action} is not null and length(btrim(${table.action})) > 0)`
		),
		voidCheck: check(
			'water_temperature_checks_void_check',
			sql`(${table.voidedAt} is null and ${table.voidedBy} is null and ${table.voidReason} is null) or (${table.voidedAt} is not null and ${table.voidedBy} is not null and coalesce(length(btrim(${table.voidReason})), 0) > 0)`
		)
	})
);

// Append-only recheck facts for a fixture that started above the safe range.
// Rows are never updated or deleted; a mistyped/incorrect recheck is
// superseded (supersededAt/By/Reason) so state derivation can ignore it while
// the original fact remains in history.
export const waterTemperatureRechecks = pgTable(
	'water_temperature_rechecks',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		checkId: uuid('check_id')
			.notNull()
			.references(() => waterTemperatureChecks.id, {onDelete: 'restrict'}),
		fixture: varchar('fixture', {length: 20}).notNull(),
		tempTenths: integer('temp_tenths').notNull(),
		staffId: varchar('staff_id', {length: 255}).notNull(),
		staffNameSnapshot: varchar('staff_name_snapshot', {
			length: 255
		}).notNull(),
		staffInitialsSnapshot: varchar('staff_initials_snapshot', {
			length: 10
		}).notNull(),
		measuredAt: timestamp('measured_at').notNull(),
		sequence: integer('sequence').notNull(),
		supersededAt: timestamp('superseded_at'),
		supersededBy: varchar('superseded_by', {length: 255}),
		supersededReason: text('superseded_reason'),
		voidedAt: timestamp('voided_at'),
		voidedBy: varchar('voided_by', {length: 255}),
		voidReason: text('void_reason'),
		createdBy: varchar('created_by', {length: 255}).notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(table) => ({
		checkIdIdx: index('water_temperature_rechecks_check_id_idx').on(
			table.checkId
		),
		checkFixtureSequenceIdx: uniqueIndex(
			'water_temperature_rechecks_check_fixture_sequence_uidx'
		).on(table.checkId, table.fixture, table.sequence),
		fixtureCheck: check(
			'water_temperature_rechecks_fixture_check',
			sql`${table.fixture} in ('kitchen', 'bath_shower')`
		),
		tempCheck: check(
			'water_temperature_rechecks_temp_check',
			sql`${table.tempTenths} between 0 and 2500`
		),
		sequenceCheck: check(
			'water_temperature_rechecks_sequence_check',
			sql`${table.sequence} >= 1`
		),
		snapshotCheck: check(
			'water_temperature_rechecks_snapshot_check',
			sql`length(btrim(${table.staffNameSnapshot})) > 0 and length(btrim(${table.staffInitialsSnapshot})) > 0 and length(btrim(${table.staffId})) > 0`
		),
		supersededCheck: check(
			'water_temperature_rechecks_superseded_check',
			sql`(${table.supersededAt} is null and ${table.supersededBy} is null and ${table.supersededReason} is null) or (${table.supersededAt} is not null and ${table.supersededBy} is not null and coalesce(length(btrim(${table.supersededReason})), 0) > 0)`
		),
		voidCheck: check(
			'water_temperature_rechecks_void_check',
			sql`(${table.voidedAt} is null and ${table.voidedBy} is null and ${table.voidReason} is null) or (${table.voidedAt} is not null and ${table.voidedBy} is not null and coalesce(length(btrim(${table.voidReason})), 0) > 0)`
		)
	})
);

// Aggregate before/after audit trail for a water-temperature check, covering
// create/correct/action/recheck/supersede/void. Snapshots are plain JSON
// captures of the check (and, where relevant, its rechecks) at the time of
// the action; they are never mutated after insert.
export const waterTemperatureCheckRevisions = pgTable(
	'water_temperature_check_revisions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		checkId: uuid('check_id')
			.notNull()
			.references(() => waterTemperatureChecks.id, {onDelete: 'restrict'}),
		version: integer('version').notNull(),
		action: varchar('action', {length: 20}).notNull(),
		beforeSnapshot: jsonb('before_snapshot').$type<Record<
			string,
			unknown
		> | null>(),
		afterSnapshot: jsonb('after_snapshot')
			.$type<Record<string, unknown>>()
			.notNull(),
		reason: text('reason'),
		actorId: varchar('actor_id', {length: 255}).notNull(),
		actorNameSnapshot: varchar('actor_name_snapshot', {length: 255}),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(table) => ({
		checkIdIdx: index('water_temperature_check_revisions_check_id_idx').on(
			table.checkId
		),
		checkVersionIdx: uniqueIndex(
			'water_temperature_check_revisions_check_version_uidx'
		).on(table.checkId, table.version),
		actionCheck: check(
			'water_temperature_check_revisions_action_check',
			sql`${table.action} in ('create', 'correct', 'action', 'recheck', 'supersede', 'void')`
		),
		versionCheck: check(
			'water_temperature_check_revisions_version_check',
			sql`${table.version} >= 1`
		),
		afterSnapshotCheck: check(
			'water_temperature_check_revisions_after_snapshot_check',
			sql`jsonb_typeof(${table.afterSnapshot}) = 'object'`
		),
		beforeSnapshotCheck: check(
			'water_temperature_check_revisions_before_snapshot_check',
			sql`${table.beforeSnapshot} is null or jsonb_typeof(${table.beforeSnapshot}) = 'object'`
		)
	})
);

// Inspector Access Table
// One-time-password grants that let a state inspector view a location's
// compliance data through a read-only dashboard, without a Clerk account.
export const inspectorAccess = pgTable(
	'inspector_access',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		locationId: uuid('location_id').references(() => locations.id, {
			onDelete: 'set null'
		}),
		location: varchar('location', {length: 255}).notNull(),
		label: varchar('label', {length: 255}), // e.g. inspector name / purpose
		otpHash: varchar('otp_hash', {length: 255}).notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		createdBy: varchar('created_by', {length: 255}).notNull(),
		createdByName: varchar('created_by_name', {length: 255}),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		revokedAt: timestamp('revoked_at'),
		revokedBy: varchar('revoked_by', {length: 255}),
		lastAccessedAt: timestamp('last_accessed_at')
	},
	(table) => ({
		otpHashIdx: index('inspector_access_otp_hash_idx').on(table.otpHash),
		locationIdIdx: index('inspector_access_location_id_idx').on(
			table.locationId
		),
		locationIdx: index('inspector_access_location_idx').on(table.location),
		expiresAtIdx: index('inspector_access_expires_at_idx').on(table.expiresAt)
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
		updatedAt: timestamp('updated_at')
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
		severityIdx: index('incident_reports_severity_idx').on(table.severity)
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
	fireDrillParticipants: many(fireDrillParticipants)
}));

export const locationsRelations = relations(locations, ({many}) => ({
	lifeSafetyInspectionEntries: many(lifeSafetyInspectionEntries),
	fireDrillReports: many(fireDrillReports),
	waterTemperatureChecks: many(waterTemperatureChecks),
	shifts: many(shifts)
}));

export const lifeSafetyInspectionEntriesRelations = relations(
	lifeSafetyInspectionEntries,
	({one, many}) => ({
		location: one(locations, {
			fields: [lifeSafetyInspectionEntries.locationId],
			references: [locations.id]
		}),
		revisions: many(lifeSafetyReportRevisions, {
			relationName: 'inspectionRevisions'
		})
	})
);

export const fireDrillReportsRelations = relations(
	fireDrillReports,
	({one, many}) => ({
		location: one(locations, {
			fields: [fireDrillReports.locationId],
			references: [locations.id]
		}),
		participants: many(fireDrillParticipants),
		revisions: many(lifeSafetyReportRevisions, {
			relationName: 'fireDrillRevisions'
		})
	})
);

export const fireDrillParticipantsRelations = relations(
	fireDrillParticipants,
	({one}) => ({
		report: one(fireDrillReports, {
			fields: [fireDrillParticipants.fireDrillReportId],
			references: [fireDrillReports.id]
		}),
		resident: one(residents, {
			fields: [fireDrillParticipants.residentId],
			references: [residents.id]
		})
	})
);

export const lifeSafetyReportRevisionsRelations = relations(
	lifeSafetyReportRevisions,
	({one}) => ({
		inspectionEntry: one(lifeSafetyInspectionEntries, {
			fields: [lifeSafetyReportRevisions.inspectionEntryId],
			references: [lifeSafetyInspectionEntries.id],
			relationName: 'inspectionRevisions'
		}),
		fireDrillReport: one(fireDrillReports, {
			fields: [lifeSafetyReportRevisions.fireDrillReportId],
			references: [fireDrillReports.id],
			relationName: 'fireDrillRevisions'
		})
	})
);

export const employeesRelations = relations(employees, ({many}) => ({
	hrFiles: many(hrFiles),
	hrFileLogs: many(hrFileLogs),
	trainings: many(employeeTrainings)
}));

export const shiftsRelations = relations(shifts, ({one, many}) => ({
	kiosk: one(kiosks, {
		fields: [shifts.kioskId],
		references: [kiosks.id]
	}),
	residentLogs: many(residentLogs),
	location: one(locations, {
		fields: [shifts.locationId],
		references: [locations.id]
	}),
	waterTemperatureChecks: many(waterTemperatureChecks)
}));

export const waterTemperatureChecksRelations = relations(
	waterTemperatureChecks,
	({one, many}) => ({
		location: one(locations, {
			fields: [waterTemperatureChecks.locationId],
			references: [locations.id]
		}),
		shift: one(shifts, {
			fields: [waterTemperatureChecks.shiftId],
			references: [shifts.id]
		}),
		rechecks: many(waterTemperatureRechecks),
		revisions: many(waterTemperatureCheckRevisions)
	})
);

export const waterTemperatureRechecksRelations = relations(
	waterTemperatureRechecks,
	({one}) => ({
		check: one(waterTemperatureChecks, {
			fields: [waterTemperatureRechecks.checkId],
			references: [waterTemperatureChecks.id]
		})
	})
);

export const waterTemperatureCheckRevisionsRelations = relations(
	waterTemperatureCheckRevisions,
	({one}) => ({
		check: one(waterTemperatureChecks, {
			fields: [waterTemperatureCheckRevisions.checkId],
			references: [waterTemperatureChecks.id]
		})
	})
);

export const residentLogsRelations = relations(residentLogs, ({one, many}) => ({
	resident: one(residents, {
		fields: [residentLogs.residentId],
		references: [residents.id]
	}),
	shift: one(shifts, {
		fields: [residentLogs.shiftId],
		references: [shifts.id]
	}),
	activities: many(residentLogActivities)
}));

export const ispFilesRelations = relations(ispFiles, ({one, many}) => ({
	resident: one(residents, {
		fields: [ispFiles.residentId],
		references: [residents.id]
	}),
	accessLogs: many(ispAccessLogs)
}));

export const ispAccessLogsRelations = relations(ispAccessLogs, ({one}) => ({
	ispFile: one(ispFiles, {
		fields: [ispAccessLogs.ispFileId],
		references: [ispFiles.id]
	}),
	resident: one(residents, {
		fields: [ispAccessLogs.residentId],
		references: [residents.id]
	})
}));

export const ispRelations = relations(isp, ({one, many}) => ({
	resident: one(residents, {
		fields: [isp.residentId],
		references: [residents.id]
	}),
	acknowledgments: many(ispAcknowledgments)
}));

export const ispAcknowledgmentsRelations = relations(
	ispAcknowledgments,
	({one}) => ({
		resident: one(residents, {
			fields: [ispAcknowledgments.residentId],
			references: [residents.id]
		}),
		isp: one(isp, {
			fields: [ispAcknowledgments.ispId],
			references: [isp.id]
		})
	})
);

export const fireEvacRelations = relations(fireEvac, ({one}) => ({
	resident: one(residents, {
		fields: [fireEvac.residentId],
		references: [residents.id]
	})
}));

export const guardianChecklistLinksRelations = relations(
	guardianChecklistLinks,
	({one}) => ({
		resident: one(residents, {
			fields: [guardianChecklistLinks.residentId],
			references: [residents.id]
		}),
		template: one(guardianChecklistTemplates, {
			fields: [guardianChecklistLinks.templateId],
			references: [guardianChecklistTemplates.id]
		})
	})
);

export const guardianChecklistTemplatesRelations = relations(
	guardianChecklistTemplates,
	({many}) => ({
		links: many(guardianChecklistLinks)
	})
);

export const hrFilesRelations = relations(hrFiles, ({one, many}) => ({
	employee: one(employees, {
		fields: [hrFiles.employeeId],
		references: [employees.id]
	}),
	logs: many(hrFileLogs)
}));

export const hrFileLogsRelations = relations(hrFileLogs, ({one}) => ({
	hrFile: one(hrFiles, {
		fields: [hrFileLogs.hrFileId],
		references: [hrFiles.id]
	}),
	employee: one(employees, {
		fields: [hrFileLogs.employeeId],
		references: [employees.id]
	})
}));

export const complianceReminderTemplatesRelations = relations(
	complianceReminderTemplates,
	({one}) => ({
		createdByUser: one(users, {
			fields: [complianceReminderTemplates.createdBy],
			references: [users.id]
		})
	})
);

export const employeeTrainingsRelations = relations(
	employeeTrainings,
	({one}) => ({
		employee: one(employees, {
			fields: [employeeTrainings.employeeId],
			references: [employees.id]
		})
	})
);

export const residentLogActivitiesRelations = relations(
	residentLogActivities,
	({one}) => ({
		log: one(residentLogs, {
			fields: [residentLogActivities.logId],
			references: [residentLogs.id]
		})
	})
);

export const incidentReportsRelations = relations(incidentReports, ({one}) => ({
	resident: one(residents, {
		fields: [incidentReports.residentId],
		references: [residents.id]
	})
}));

// Memos Table
export const memos = pgTable(
	'memos',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		title: varchar('title', {length: 255}).notNull(),
		content: text('content').notNull(),
		senderClerkUserId: varchar('sender_clerk_user_id', {
			length: 255
		}).notNull(),
		senderName: varchar('sender_name', {length: 255}).notNull(),
		recipientType: varchar('recipient_type', {length: 50}).notNull(), // 'location', 'all-staff', 'all-supervisors', 'all-employees', 'selected-locations', 'selected-users'
		targetLocations: jsonb('target_locations').$type<string[]>().default([]),
		targetUsers: jsonb('target_users').$type<string[]>().default([]), // clerk user IDs
		priority: varchar('priority', {length: 20}).default('normal'), // 'normal', 'high', 'urgent'
		expiresAt: timestamp('expires_at'),
		createdAt: timestamp('created_at').defaultNow(),
		updatedAt: timestamp('updated_at')
	},
	(table) => ({
		senderIdx: index('memos_sender_idx').on(table.senderClerkUserId),
		createdAtIdx: index('memos_created_at_idx').on(table.createdAt),
		recipientTypeIdx: index('memos_recipient_type_idx').on(table.recipientType)
	})
);

// Memos Read Tracking Table
export const memosRead = pgTable(
	'memos_read',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		memoId: uuid('memo_id')
			.notNull()
			.references(() => memos.id, {onDelete: 'cascade'}),
		clerkUserId: varchar('clerk_user_id', {length: 255}).notNull(),
		readAt: timestamp('read_at').defaultNow()
	},
	(table) => ({
		memoIdIdx: index('memos_read_memo_id_idx').on(table.memoId),
		userIdIdx: index('memos_read_user_id_idx').on(table.clerkUserId)
	})
);

// Vacation Requests Table
export const vacationRequests = pgTable(
	'vacation_requests',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		employeeClerkUserId: varchar('employee_clerk_user_id', {
			length: 255
		}).notNull(),
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
		updatedAt: timestamp('updated_at').defaultNow()
	},
	(table) => ({
		employeeIdx: index('vacation_requests_employee_idx').on(
			table.employeeClerkUserId
		),
		statusIdx: index('vacation_requests_status_idx').on(table.status),
		startDateIdx: index('vacation_requests_start_date_idx').on(table.startDate)
	})
);
