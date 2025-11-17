import {NextResponse} from 'next/server';

export async function GET() {
	// Return predefined log templates
	const templates = [
		{
			id: 'daily_observation',
			name: 'Daily Observation',
			description: 'Standard daily observation log',
			fields: [
				{
					name: 'mood',
					label: 'Mood',
					type: 'select',
					options: ['Happy', 'Neutral', 'Sad', 'Anxious'],
				},
				{name: 'behavior', label: 'Behavior', type: 'textarea'},
				{name: 'activities', label: 'Activities', type: 'textarea'},
				{name: 'notes', label: 'Additional Notes', type: 'textarea'},
			],
		},
		{
			id: 'medication',
			name: 'Medication Administration',
			description: 'Medication administration record',
			fields: [
				{name: 'medication', label: 'Medication Name', type: 'text'},
				{name: 'dosage', label: 'Dosage', type: 'text'},
				{name: 'time', label: 'Time Administered', type: 'time'},
				{name: 'notes', label: 'Notes', type: 'textarea'},
			],
		},
		{
			id: 'incident',
			name: 'Incident Report',
			description: 'Report any incidents or concerns',
			fields: [
				{
					name: 'type',
					label: 'Incident Type',
					type: 'select',
					options: ['Fall', 'Medical', 'Behavioral', 'Other'],
				},
				{name: 'description', label: 'Description', type: 'textarea'},
				{name: 'action_taken', label: 'Action Taken', type: 'textarea'},
			],
		},
	];

	return NextResponse.json(templates);
}
