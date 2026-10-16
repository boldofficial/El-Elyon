'use client';

// src/components/admin/GlucoseTrackingSettings.tsx
//
// Blood sugar section of the resident profile's Care Tracking card: turn the
// log on, set the resident's own limits (mg/dL), the checks expected each day
// and the physician's instructions staff see when logging. Saved with the
// rest of the profile.

import React from 'react';
import {
	DEFAULT_GLUCOSE_THRESHOLDS,
	SCHEDULABLE_CHECKS,
	THRESHOLD_LIMITS,
	mgDlToMmolL,
	resolveGlucoseThresholds,
	validateGlucoseThresholds,
} from '@/lib/blood-glucose';

export interface GlucoseSettingsValues {
	glucoseTrackingEnabled?: boolean;
	glucoseCriticalLowMgDl?: number | null;
	glucoseCriticalHighMgDl?: number | null;
	glucoseScheduledChecks?: string[] | null;
	glucoseCareInstructions?: string | null;
}

type LimitKey = 'glucoseCriticalLowMgDl' | 'glucoseCriticalHighMgDl';

const LIMIT_FIELDS: Array<{key: LimitKey; label: string; help: string; fallback: number}> = [
	{
		key: 'glucoseCriticalLowMgDl',
		label: 'Critical low (below)',
		help: 'Below this is flagged critical',
		fallback: DEFAULT_GLUCOSE_THRESHOLDS.criticalLow,
	},
	{
		key: 'glucoseCriticalHighMgDl',
		label: 'Critical high (above)',
		help: 'Above this is flagged critical',
		fallback: DEFAULT_GLUCOSE_THRESHOLDS.criticalHigh,
	},
];

interface Props {
	values: GlucoseSettingsValues;
	onChange: (patch: Partial<GlucoseSettingsValues>) => void;
}

export default function GlucoseTrackingSettings({values, onChange}: Props) {
	const enabled = values.glucoseTrackingEnabled ?? false;
	const scheduled = new Set(values.glucoseScheduledChecks ?? []);
	const limitsError = validateGlucoseThresholds(
		resolveGlucoseThresholds({
			glucoseCriticalLowMgDl: values.glucoseCriticalLowMgDl ?? null,
			glucoseCriticalHighMgDl: values.glucoseCriticalHighMgDl ?? null,
		})
	);

	return (
		<div className="space-y-4">
			<label className="flex items-start gap-3 cursor-pointer">
				<input
					type="checkbox"
					checked={enabled}
					onChange={(e) => onChange({glucoseTrackingEnabled: e.target.checked})}
					className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				/>
				<span>
					<span className="block font-medium text-gray-900">Blood sugar log</span>
					<span className="block text-sm text-gray-600">
						Staff and supervisors will see a Blood Sugar tab for this resident, readings outside
						the limits below are flagged, and rechecks and scheduled checks show on the
						dashboard.
					</span>
				</span>
			</label>

			{enabled && (
				<div className="ml-8 space-y-5 border-l-2 border-gray-100 pl-4">
					<div>
						<h3 className="font-medium text-gray-900">Critical limits (mg/dL)</h3>
						<p className="text-sm text-gray-600 mb-3">
							Readings between these are just recorded. Only a reading outside them is
							flagged, and staff then record symptoms and what was done. Use the numbers from
							this resident&apos;s physician orders, or leave a box blank to use the default
							shown in grey.
						</p>
						<div className="grid grid-cols-2 gap-3 max-w-md">
							{LIMIT_FIELDS.map((field) => {
								const value = values[field.key];
								return (
									<div key={field.key}>
										<label
											htmlFor={`glucose-${field.key}`}
											className="block text-sm font-medium mb-1">
											{field.label}
										</label>
										<input
											id={`glucose-${field.key}`}
											type="number"
											inputMode="numeric"
											min={THRESHOLD_LIMITS.min}
											max={THRESHOLD_LIMITS.max}
											step={1}
											value={value ?? ''}
											placeholder={String(field.fallback)}
											onChange={(e) =>
												onChange({
													[field.key]: e.target.value === '' ? null : Number(e.target.value),
												})
											}
											className="w-full border rounded px-3 py-2"
										/>
										<p className="text-xs text-gray-500 mt-1">
											{field.help}
											{typeof value === 'number' && value > 0
												? ` (${mgDlToMmolL(value)} mmol/L)`
												: ''}
										</p>
									</div>
								);
							})}
						</div>
						{limitsError && <p className="text-sm text-red-700 mt-2">{limitsError}</p>}
					</div>

					<fieldset>
						<legend className="font-medium text-gray-900">Checks expected every day</legend>
						<p className="text-sm text-gray-600 mb-2">
							Staff are reminded on the dashboard when one of these is due or missed. As-needed
							checks can always be logged.
						</p>
						<div className="flex flex-wrap gap-2">
							{SCHEDULABLE_CHECKS.map((slot) => (
								<label
									key={slot.key}
									className={`flex items-center gap-2 px-3 py-2 rounded border text-sm cursor-pointer ${
										scheduled.has(slot.key) ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
									}`}>
									<input
										type="checkbox"
										checked={scheduled.has(slot.key)}
										onChange={(e) => {
											const next = new Set(scheduled);
											if (e.target.checked) next.add(slot.key);
											else next.delete(slot.key);
											onChange({
												glucoseScheduledChecks: SCHEDULABLE_CHECKS.map((s) => s.key).filter((k) =>
													next.has(k)
												),
											});
										}}
										className="h-4 w-4"
									/>
									{slot.label}
									<span className="text-xs text-gray-500">
										{slot.from} to {slot.to}
									</span>
								</label>
							))}
						</div>
					</fieldset>

					<div>
						<label htmlFor="glucose-instructions" className="block font-medium text-gray-900 mb-1">
							Physician instructions
						</label>
						<textarea
							id="glucose-instructions"
							value={values.glucoseCareInstructions ?? ''}
							onChange={(e) => onChange({glucoseCareInstructions: e.target.value})}
							rows={3}
							placeholder="e.g. If under 70, give 4 oz juice and recheck in 15 minutes. Call Dr. Smith if over 300."
							className="w-full border rounded px-3 py-2"
						/>
						<p className="text-xs text-gray-500 mt-1">
							Shown to staff at the top of the Blood Sugar tab.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
