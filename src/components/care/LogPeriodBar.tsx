'use client';

// src/components/care/LogPeriodBar.tsx
//
// History header shared by the carb log and blood sugar log: a period picker
// (last 14 days, or any of the past months) and a print button for the month
// the picker shows. One control drives both, so what staff browse is what
// they print.

import {monthLabel, periodOptions, printMonthFor, type LogPeriod} from '@/lib/log-period';

interface Props {
	idPrefix: string;
	/** Operational date the server reported, "YYYY-MM-DD". */
	today: string;
	period: LogPeriod;
	onPeriodChange: (period: LogPeriod) => void;
	printing: boolean;
	onPrint: () => void;
}

export default function LogPeriodBar({
	idPrefix,
	today,
	period,
	onPeriodChange,
	printing,
	onPrint,
}: Props) {
	const printMonth = printMonthFor(period, today);
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 mb-2">
			<div className="flex items-center gap-2">
				<label htmlFor={`${idPrefix}-period`} className="font-semibold text-gray-900">
					History
				</label>
				<select
					id={`${idPrefix}-period`}
					value={period}
					onChange={(e) => onPeriodChange(e.target.value)}
					className="border rounded px-2 py-1.5 text-sm min-h-[40px] bg-white">
					{periodOptions(today).map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</div>
			<button
				type="button"
				onClick={onPrint}
				disabled={printing}
				className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50">
				{printing ? 'Preparing…' : `🖨 Print ${monthLabel(printMonth)}`}
			</button>
		</div>
	);
}
