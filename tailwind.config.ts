import type {Config} from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

export default {
	content: [
		'./src/pages/**/*.{js,ts,jsx,tsx,mdx}',
		'./src/components/**/*.{js,ts,jsx,tsx,mdx}',
		'./src/app/**/*.{js,ts,jsx,tsx,mdx}',
	],
	theme: {
		extend: {
			fontFamily: {
				sans: [
					'Inter var',
					...defaultTheme.fontFamily.sans,
				],
			},
			borderRadius: {
				DEFAULT: '8px',
				secondary: '4px',
				container: '12px',
			},
			boxShadow: {
				DEFAULT: '0 1px 4px rgba(0, 0, 0, 0.1)',
				hover: '0 2px 8px rgba(0, 0, 0, 0.12)',
			},
			colors: {
				primary: {
					DEFAULT: '#0ea5e9',
					hover: '#0284c7',
				},
				secondary: {
					DEFAULT: '#6B7280',
					hover: '#4B5563',
				},
				accent: {
					DEFAULT: '#38bdf8',
					hover: '#0ea5e9',
				},
			},
			spacing: {
				'form-field': '16px',
				section: '32px',
			},
		},
	},
} satisfies Config;
