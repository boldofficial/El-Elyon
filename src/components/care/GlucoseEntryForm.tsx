'use client';

// src/components/care/GlucoseEntryForm.tsx
//
// One form for logging a blood sugar check, logging a recheck and editing an
// entry. The status chip updates as the reading is typed, and the
// "what happened" section opens once the reading is critical. Symptoms are
// then required, and an action is required only if the resident has symptoms. The server applies the same rules
// (lib/blood-glucose.ts) and has the final say.

import React, {useMemo, useState} from 'react';
import {
	ACTIONS,
	ACTION_LABELS,
	CHECK_METHODS,
	CHECK_METHOD_LABELS,
	CHECK_TYPES,
	CHECK_TYPE_LABELS,
	DEFAULT_GLUCOSE_UNIT,
	GLUCOSE_STATUS_LABELS,
	GLUCOSE_UNITS,
	GLUCOSE_UNIT_LABELS,
	NOTIFY_ACTIONS,
	READING_LIMITS,
	SYMPTOMS,
	SYMPTOM_LABELS,
	classifyReading,
	isCritical,
	mgDlToMmolL,
	toMgDl,
	type GlucoseAction,
	type GlucoseCheckMethod,
	type GlucoseCheckType,
	type GlucoseStatus,
	type GlucoseSymptom,
	type GlucoseThresholds,
	type GlucoseUnit,
} from '@/lib/blood-glucose';
import {GLUCOSE_STATUS_CHIP, glucoseGuidance, toLocalInputValue} from './glucosePresentation';

export interface GlucoseFormValues {
	checkedAtLocal: string;
	checkType: GlucoseCheckType | '';
	method: GlucoseCheckMethod;
	refused: boolean;
	refusalReason: string;
	readingValue: string;
	readingUnit: GlucoseUnit;
	symptoms: GlucoseSymptom[];
	actionsTaken: GlucoseAction[];
	notifiedWho: string;
	insulinGiven: boolean;
	insulinType: string;
	insulinUnits: string;
	notes: string;
	reason: string;
}

export function emptyGlucoseForm(overrides: Partial<GlucoseFormValues> = {}): GlucoseFormValues {
	return {
		checkedAtLocal: toLocalInputValue(new Date()),
		checkType: '',
		method: 'fingerstick',
		refused: false,
		refusalReason: '',
		readingValue: '',
		readingUnit: DEFAULT_GLUCOSE_UNIT,
		symptoms: [],
		actionsTaken: [],
		notifiedWho: '',
		insulinGiven: false,
		insulinType: '',
		insulinUnits: '',
		notes: '',
		reason: '',
		...overrides,
	};
}

/** Request body for POST/PATCH; `reason` is only meaningful on edit. */
export function glucoseFormToPayload(values: GlucoseFormValues) {
	return {
		checkedAt: values.checkedAtLocal ? new Date(values.checkedAtLocal).toISOString() : undefined,
		checkType: values.checkType,
		method: values.method,
		refused: values.refused,
		refusalReason: values.refusalReason,
		readingValue: values.refused || values.readingValue === '' ? null : Number(values.readingValue),
		readingUnit: values.readingUnit,
		symptoms: values.symptoms,
		actionsTaken: values.actionsTaken,
		notifiedWho: values.notifiedWho,
		insulinGiven: values.insulinGiven,
		insulinType: values.insulinType,
		insulinUnits: values.insulinGiven && values.insulinUnits !== '' ? Number(values.insulinUnits) : null,
		notes: values.notes,
		reason: values.reason,
	};
}

interface Props {
	idPrefix: string;
	mode: 'create' | 'recheck' | 'edit';
	initial: GlucoseFormValues;
	thresholds: GlucoseThresholds;
	saving: boolean;
	submitLabel: string;
	onSubmit: (values: GlucoseFormValues) => void;
	onCancel?: () => void;
	/** Check types already logged today (disabled in the dropdown when creating). */
	loggedToday?: ReadonlySet<string>;
}

const inputClass = 'w-full border rounded px-3 py-2 min-h-[44px]';

function liveStatus(values: GlucoseFormValues, t: GlucoseThresholds): GlucoseStatus | null {
	if (values.refused) return 'refused';
	if (values.readingValue.trim() === '') return null;
	const n = Number(values.readingValue);
	const limits = READING_LIMITS[values.readingUnit];
	if (!Number.isFinite(n) || n < limits.min || n > limits.max) return null;
	return classifyReading(toMgDl(n, values.readingUnit), t);
}

export default function GlucoseEntryForm({
	idPrefix,
	mode,
	initial,
	thresholds,
	saving,
	submitLabel,
	onSubmit,
	onCancel,
	loggedToday,
}: Props) {
	const [values, setValues] = useState<GlucoseFormValues>(initial);
	const [showDetails, setShowDetails] = useState(
		initial.symptoms.length > 0 || initial.actionsTaken.length > 0
	);
	const set = <K extends keyof GlucoseFormValues>(key: K, value: GlucoseFormValues[K]) =>
		setValues((prev) => ({...prev, [key]: value}));

	const status = useMemo(() => liveStatus(values, thresholds), [values, thresholds]);
	const critical = status !== null && isCritical(status);
	const hasSymptoms = values.symptoms.some((s) => s !== 'none');
	const detailsOpen = critical || values.refused || showDetails;
	const needsNotifiedWho = values.actionsTaken.some((a) => NOTIFY_ACTIONS.has(a));
	const guidance = status ? glucoseGuidance(status) : null;
	const id = (name: string) => `${idPrefix}-${name}`;

	const toggle = <T extends string>(list: T[], item: T): T[] =>
		list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

	const toggleSymptom = (symptom: GlucoseSymptom) =>
		setValues((prev) => {
			if (symptom === 'none') {
				return {...prev, symptoms: prev.symptoms.includes('none') ? [] : ['none']};
			}
			return {
				...prev,
				symptoms: toggle(prev.symptoms.filter((s) => s !== 'none'), symptom),
			};
		});

	const converted = (() => {
		const n = Number(values.readingValue);
		if (values.refused || values.readingValue === '' || !Number.isFinite(n)) return null;
		return values.readingUnit === 'mg_dl' ? `${mgDlToMmolL(n)} mmol/L` : `${toMgDl(n, 'mmol_l')} mg/dL`;
	})();

	// "Recheck" is only ever set by the Log recheck button, never picked by hand.
	const checkTypeOptions = CHECK_TYPES.filter(
		(t) => t !== 'recheck' || values.checkType === 'recheck'
	);

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit(values);
			}}
			className="space-y-4">
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<div>
					<label htmlFor={id('time')} className="block text-sm font-medium mb-1">
						Date and time of check
					</label>
					<input
						id={id('time')}
						type="datetime-local"
						value={values.checkedAtLocal}
						onChange={(e) => set('checkedAtLocal', e.target.value)}
						required
						className={inputClass}
					/>
				</div>
				<div>
					<label htmlFor={id('type')} className="block text-sm font-medium mb-1">
						Type of check
					</label>
					<select
						id={id('type')}
						value={values.checkType}
						onChange={(e) => set('checkType', e.target.value as GlucoseCheckType | '')}
						required
						disabled={mode === 'recheck' || values.checkType === 'recheck'}
						className={inputClass}>
						<option value="">Select…</option>
						{checkTypeOptions.map((t) => (
							<option key={t} value={t}>
								{CHECK_TYPE_LABELS[t]}
								{mode === 'create' && loggedToday?.has(t) && t !== 'prn' && t !== 'after_meal'
									? ' (already logged today)'
									: ''}
							</option>
						))}
					</select>
				</div>
				<div>
					<label htmlFor={id('method')} className="block text-sm font-medium mb-1">
						How it was taken
					</label>
					<select
						id={id('method')}
						value={values.method}
						onChange={(e) => set('method', e.target.value as GlucoseCheckMethod)}
						className={inputClass}>
						{CHECK_METHODS.map((m) => (
							<option key={m} value={m}>
								{CHECK_METHOD_LABELS[m]}
							</option>
						))}
					</select>
				</div>
			</div>

			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={values.refused}
					onChange={(e) => set('refused', e.target.checked)}
					className="h-5 w-5 rounded border-gray-300"
				/>
				Check not done (resident refused or unavailable)
			</label>

			{values.refused ? (
				<div>
					<label htmlFor={id('refusal')} className="block text-sm font-medium mb-1">
						Why was the check not done?
					</label>
					<input
						id={id('refusal')}
						type="text"
						value={values.refusalReason}
						onChange={(e) => set('refusalReason', e.target.value)}
						required
						placeholder="e.g. Resident refused after two attempts"
						className={inputClass}
					/>
				</div>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
					<div className="sm:col-span-2">
						<label htmlFor={id('reading')} className="block text-sm font-medium mb-1">
							Reading
						</label>
						<div className="flex gap-2">
							<input
								id={id('reading')}
								type="number"
								inputMode="decimal"
								min={READING_LIMITS[values.readingUnit].min}
								max={READING_LIMITS[values.readingUnit].max}
								step={values.readingUnit === 'mg_dl' ? 1 : 0.1}
								value={values.readingValue}
								onChange={(e) => set('readingValue', e.target.value)}
								required
								className={`${inputClass} text-lg font-semibold`}
							/>
							<select
								aria-label="Unit"
								value={values.readingUnit}
								onChange={(e) => set('readingUnit', e.target.value as GlucoseUnit)}
								className="border rounded px-2 py-2 min-h-[44px]">
								{GLUCOSE_UNITS.map((u) => (
									<option key={u} value={u}>
										{GLUCOSE_UNIT_LABELS[u]}
									</option>
								))}
							</select>
						</div>
						<p className="text-xs text-gray-500 mt-1">
							{converted ? `Same as ${converted}. ` : ''}
							If the meter shows HI or LO, enter the meter&apos;s limit (for example 600 or
							20 {GLUCOSE_UNIT_LABELS.mg_dl}) and say so in the notes.
						</p>
					</div>
					<div className="pt-0 sm:pt-6" aria-live="polite">
						{status && (
							<span
								className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${GLUCOSE_STATUS_CHIP[status]}`}>
								{GLUCOSE_STATUS_LABELS[status]}
							</span>
						)}
					</div>
				</div>
			)}

			{guidance && (
				<div
					role="alert"
					className="rounded border p-3 text-sm border-red-300 bg-red-50 text-red-900">
					{guidance}
				</div>
			)}

			{!detailsOpen && (
				<button
					type="button"
					onClick={() => setShowDetails(true)}
					className="text-sm text-blue-700 hover:underline">
					+ Add symptoms or actions taken
				</button>
			)}

			{detailsOpen && (
				<div className="space-y-4 rounded-lg border border-gray-200 p-3">
					<fieldset>
						<legend className="text-sm font-medium mb-2">
							Symptoms seen{' '}
							{critical ? (
								<span className="text-red-700">(required, tick &quot;None&quot; if there were none)</span>
							) : (
								<span className="text-gray-400 font-normal">(optional)</span>
							)}
						</legend>
						<div className="flex flex-wrap gap-2">
							{SYMPTOMS.map((s) => (
								<label
									key={s}
									className={`flex items-center gap-2 px-3 py-2 min-h-[44px] rounded border text-sm cursor-pointer ${
										values.symptoms.includes(s) ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
									}`}>
									<input
										type="checkbox"
										checked={values.symptoms.includes(s)}
										onChange={() => toggleSymptom(s)}
										className="h-4 w-4"
									/>
									{SYMPTOM_LABELS[s]}
								</label>
							))}
						</div>
					</fieldset>

					<fieldset>
						<legend className="text-sm font-medium mb-2">
							What was done{' '}
							{critical && hasSymptoms ? (
								<span className="text-red-700">(required, or record insulin below)</span>
							) : (
								<span className="text-gray-400 font-normal">(optional)</span>
							)}
						</legend>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
							{ACTIONS.map((a) => (
								<label
									key={a}
									className={`flex items-center gap-2 px-3 py-2 min-h-[44px] rounded border text-sm cursor-pointer ${
										values.actionsTaken.includes(a) ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
									}`}>
									<input
										type="checkbox"
										checked={values.actionsTaken.includes(a)}
										onChange={() => set('actionsTaken', toggle(values.actionsTaken, a))}
										className="h-4 w-4"
									/>
									{ACTION_LABELS[a]}
								</label>
							))}
						</div>
					</fieldset>

					{needsNotifiedWho && (
						<div>
							<label htmlFor={id('notified')} className="block text-sm font-medium mb-1">
								Who was notified, and when?
							</label>
							<input
								id={id('notified')}
								type="text"
								value={values.notifiedWho}
								onChange={(e) => set('notifiedWho', e.target.value)}
								required
								placeholder="e.g. Nurse Ada Obi at 7:40 PM"
								className={inputClass}
							/>
						</div>
					)}
				</div>
			)}

			<div className="rounded-lg border border-gray-200 p-3 space-y-3">
				<label className="flex items-center gap-2 text-sm font-medium">
					<input
						type="checkbox"
						checked={values.insulinGiven}
						onChange={(e) => set('insulinGiven', e.target.checked)}
						className="h-5 w-5 rounded border-gray-300"
					/>
					Insulin given
				</label>
				{values.insulinGiven && (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label htmlFor={id('insulin-type')} className="block text-sm font-medium mb-1">
								Insulin name or type
							</label>
							<input
								id={id('insulin-type')}
								type="text"
								value={values.insulinType}
								onChange={(e) => set('insulinType', e.target.value)}
								required
								placeholder="e.g. Humalog (lispro)"
								className={inputClass}
							/>
						</div>
						<div>
							<label htmlFor={id('insulin-units')} className="block text-sm font-medium mb-1">
								Dose (units)
							</label>
							<input
								id={id('insulin-units')}
								type="number"
								inputMode="decimal"
								min={0.5}
								max={200}
								step={0.5}
								value={values.insulinUnits}
								onChange={(e) => set('insulinUnits', e.target.value)}
								required
								className={inputClass}
							/>
						</div>
						<p className="sm:col-span-2 text-xs text-gray-500">
							Give insulin only as the physician ordered. Check the order before every dose.
						</p>
					</div>
				)}
			</div>

			<div>
				<label htmlFor={id('notes')} className="block text-sm font-medium mb-1">
					Notes <span className="text-gray-400 font-normal">(optional)</span>
				</label>
				<textarea
					id={id('notes')}
					value={values.notes}
					onChange={(e) => set('notes', e.target.value)}
					rows={2}
					className="w-full border rounded px-3 py-2"
				/>
			</div>

			{mode === 'edit' && (
				<div>
					<label htmlFor={id('reason')} className="block text-sm font-medium mb-1">
						Reason for the change <span className="text-red-700">(required)</span>
					</label>
					<input
						id={id('reason')}
						type="text"
						value={values.reason}
						onChange={(e) => set('reason', e.target.value)}
						required
						placeholder="e.g. Typed 81 instead of 181"
						className={inputClass}
					/>
					<p className="text-xs text-gray-500 mt-1">
						The old values are kept in the entry&apos;s history.
					</p>
				</div>
			)}

			<div className="flex justify-end gap-2">
				{onCancel && (
					<button
						type="button"
						onClick={onCancel}
						className="px-4 py-2 min-h-[44px] rounded border border-gray-300 hover:bg-gray-50">
						Cancel
					</button>
				)}
				<button
					type="submit"
					disabled={saving}
					className="px-5 py-2 min-h-[44px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
					{saving ? 'Saving…' : submitLabel}
				</button>
			</div>
		</form>
	);
}
