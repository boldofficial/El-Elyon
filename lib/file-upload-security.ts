/**
 * File Upload Security Utilities
 * Provides validation for file types, sizes, and secure naming
 */

import crypto from 'crypto';
import path from 'path';

// Allowed file types by category
export const ALLOWED_MIME_TYPES = {
	images: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
	documents: [
		'application/pdf',
		'application/msword',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/vnd.ms-excel',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'text/plain',
		'text/csv',
	],
	videos: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo'],
	audio: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
} as const;

// Allowed file extensions (additional validation)
export const ALLOWED_EXTENSIONS: {
	images: readonly string[];
	documents: readonly string[];
	videos: readonly string[];
	audio: readonly string[];
} = {
	images: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
	documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv'],
	videos: ['.mp4', '.mpeg', '.mov', '.avi'],
	audio: ['.mp3', '.wav', '.ogg'],
};

// Maximum file sizes (in bytes)
export const MAX_FILE_SIZES = {
	image: 10 * 1024 * 1024, // 10MB
	document: 50 * 1024 * 1024, // 50MB
	video: 500 * 1024 * 1024, // 500MB
	audio: 50 * 1024 * 1024, // 50MB
} as const;

export type FileCategory = keyof typeof ALLOWED_MIME_TYPES;

interface FileValidationResult {
	valid: boolean;
	error?: string;
	sanitizedName?: string;
}

/**
 * Validates a file upload based on type, size, and naming
 * @param fileName - Original file name
 * @param fileMimeType - MIME type of the file
 * @param fileSize - Size of the file in bytes
 * @param category - Category of allowed file types
 */
export function validateFileUpload(
	fileName: string,
	fileMimeType: string,
	fileSize: number,
	category: FileCategory
): FileValidationResult {
	// 1. Check file extension
	const ext = path.extname(fileName).toLowerCase();
	const allowedExtensions = ALLOWED_EXTENSIONS[category];

	if (!allowedExtensions.includes(ext as (typeof allowedExtensions)[number])) {
		return {
			valid: false,
			error: `File type not allowed. Allowed: ${allowedExtensions.join(', ')}`,
		};
	}

	// 2. Check MIME type
	const allowedMimeTypes = ALLOWED_MIME_TYPES[category] as readonly string[];
	if (!allowedMimeTypes.includes(fileMimeType)) {
		return {
			valid: false,
			error: `Invalid file type. Expected ${category} file.`,
		};
	}

	// 3. Check file size
	const maxSize = MAX_FILE_SIZES[category === 'images' ? 'image' : category === 'documents' ? 'document' : category === 'videos' ? 'video' : 'audio'];
	
	if (fileSize > maxSize) {
		return {
			valid: false,
			error: `File too large. Maximum size: ${formatBytes(maxSize)}`,
		};
	}

	// 4. Generate sanitized file name
	const sanitizedName = sanitizeFileName(fileName);

	return {
		valid: true,
		sanitizedName,
	};
}

/**
 * Sanitizes a file name to prevent directory traversal and other attacks
 * Generates a unique name while preserving the extension
 */
export function sanitizeFileName(fileName: string): string {
	// Get extension
	const ext = path.extname(fileName).toLowerCase();
	
	// Remove extension and sanitize base name
	const baseName = path.basename(fileName, ext);
	
	// Remove any path separators, null bytes, and dangerous characters
	const sanitized = baseName
		.replace(/[\/\\]/g, '') // Remove path separators
		.replace(/\0/g, '') // Remove null bytes
		.replace(/[<>:"|?*]/g, '') // Remove Windows forbidden chars
		.replace(/\s+/g, '_') // Replace spaces with underscores
		.replace(/[^\w\-_.]/g, '') // Keep only alphanumeric, dash, underscore, dot
		.substring(0, 100); // Limit length

	// Generate unique prefix to avoid collisions
	const timestamp = Date.now();
	const random = crypto.randomBytes(4).toString('hex');
	
	// Return sanitized name with unique prefix
	return `${timestamp}-${random}-${sanitized}${ext}`;
}

/**
 * Validates file name for security issues
 * Returns true if file name is safe
 */
export function isFileNameSafe(fileName: string): boolean {
	// Check for path traversal attempts
	if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
		return false;
	}

	// Check for null bytes
	if (fileName.includes('\0')) {
		return false;
	}

	// Check for dangerous extensions (double extensions, etc.)
	const dangerousPatterns = [
		/\.exe$/i,
		/\.sh$/i,
		/\.bat$/i,
		/\.cmd$/i,
		/\.com$/i,
		/\.scr$/i,
		/\.js$/i,
		/\.vbs$/i,
		/\.php$/i,
	];

	return !dangerousPatterns.some((pattern) => pattern.test(fileName));
}

/**
 * Formats bytes into human-readable string
 */
function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Extracts file extension and validates it
 */
export function getFileExtension(fileName: string): string | null {
	const ext = path.extname(fileName).toLowerCase();
	return ext || null;
}

/**
 * Validates if a file is an image based on MIME type
 */
export function isImageFile(mimeType: string): boolean {
	return ALLOWED_MIME_TYPES.images.includes(mimeType as any);
}

/**
 * Validates if a file is a document based on MIME type
 */
export function isDocumentFile(mimeType: string): boolean {
	return ALLOWED_MIME_TYPES.documents.includes(mimeType as any);
}

/**
 * Gets the appropriate category for a MIME type
 */
export function getCategoryForMimeType(mimeType: string): FileCategory | null {
	for (const [category, mimeTypes] of Object.entries(ALLOWED_MIME_TYPES) as [FileCategory, readonly string[]][]) {
		if (mimeTypes.includes(mimeType)) {
			return category as FileCategory;
		}
	}
	return null;
}
