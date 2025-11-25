import {clsx, type ClassValue} from 'clsx';
import {twMerge} from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// Helper to generate a random token
export function generateToken(length = 8) {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let token = '';
	for (let i = 0; i < length; i++) {
		token += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return token;
}

// Helper to generate a random password
export function generatePassword(length = 12) {
	const chars =
		'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
	let password = '';
	for (let i = 0; i < length; i++) {
		password += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return password;
}

// Helper: Generate neutral resident ID for PHI-free display
export function generateNeutralId(residentId: string): string {
	let hash = 0;
	for (let i = 0; i < residentId.length; i++) {
		const char = residentId.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return Math.abs(hash % 9999)
		.toString()
		.padStart(4, '0');
}

// Helper: Hash a password (placeholder - replace with a robust hashing library like bcrypt)
export async function hashPassword(password: string): Promise<string> {
  // In a real application, use a secure hashing library like bcrypt.
  // This is a placeholder for demonstration purposes.
  return `hashed_${password}_${Math.random().toString(36).substring(7)}`;
}
