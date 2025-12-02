import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
	region: process.env.AWS_REGION!,
	endpoint: process.env.AWS_ENDPOINT_URL!,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
	},
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;

/**
 * Generate a presigned URL for uploading files
 */
export async function generateUploadUrl(
	key: string,
	contentType: string,
	expiresIn = 3600
) {
	const command = new PutObjectCommand({
		Bucket: BUCKET_NAME,
		Key: key,
		ContentType: contentType,
	});

	return await getSignedUrl(s3Client, command, {expiresIn});
}

/**
 * Generate a presigned URL for downloading files
 */
export async function generateDownloadUrl(key: string, expiresIn = 3600) {
	const command = new GetObjectCommand({
		Bucket: BUCKET_NAME,
		Key: key,
	});

	return await getSignedUrl(s3Client, command, {expiresIn});
}

/**
 * Upload a file directly to S3
 */
export async function uploadFile(
	key: string,
	body: Buffer | Uint8Array | string,
	contentType: string
) {
	const command = new PutObjectCommand({
		Bucket: BUCKET_NAME,
		Key: key,
		Body: body,
		ContentType: contentType,
	});

	const result = await s3Client.send(command);
	return {
		key,
		url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
		etag: result.ETag,
	};
}

/**
 * Delete a file from S3
 */
export async function deleteFile(key: string) {
	const command = new DeleteObjectCommand({
		Bucket: BUCKET_NAME,
		Key: key,
	});

	await s3Client.send(command);
}

/**
 * Generate a unique file key
 */
export function generateFileKey(prefix: string, filename: string) {
	const timestamp = Date.now();
	const randomString = Math.random().toString(36).substring(2, 15);
	const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
	return `${prefix}/${timestamp}-${randomString}-${sanitizedFilename}`;
}
