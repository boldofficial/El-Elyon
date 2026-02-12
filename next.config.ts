import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
	async headers() {
		return [
			// Security headers for all routes
			{
				source: '/:path*',
				headers: [
					{
						key: 'X-Frame-Options',
						value: 'DENY',
					},
					{
						key: 'X-Content-Type-Options',
						value: 'nosniff',
					},
					{
						key: 'Referrer-Policy',
						value: 'strict-origin-when-cross-origin',
					},
					{
						key: 'X-XSS-Protection',
						value: '1; mode=block',
					},
					{
						key: 'Permissions-Policy',
						value: 'camera=(), microphone=(), geolocation=()',
					},
				],
			},
			// HTTPS Strict Transport Security (only in production)
			...(process.env.NODE_ENV === 'production'
				? [
						{
							source: '/:path*',
							headers: [
								{
									key: 'Strict-Transport-Security',
									value: 'max-age=31536000; includeSubDomains; preload',
								},
							],
						},
				  ]
				: []),
			// CORS headers for API routes
			{
				source: '/api/:path*',
				headers: [
					{
						key: 'Access-Control-Allow-Credentials',
						value: 'true',
					},
					{
						key: 'Access-Control-Allow-Origin',
						value: process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3001',
					},
					{
						key: 'Access-Control-Allow-Methods',
						value: 'GET,DELETE,PATCH,POST,PUT',
					},
					{
						key: 'Access-Control-Allow-Headers',
						value:
							'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
					},
				],
			},
		];
	},
};

export default nextConfig;

