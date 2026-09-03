'use client';

import {useState} from 'react';
import FireDrillWorkspace from './FireDrillWorkspace';
import LifeSafetyInspectionWorkspace from './LifeSafetyInspectionWorkspace';

type LifeSafetyTab = 'inspections' | 'fire-drills';

export default function LifeSafetyDocuments() {
	const [activeTab, setActiveTab] = useState<LifeSafetyTab>('inspections');
	const tabClass = (tab: LifeSafetyTab) =>
		`min-h-10 rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
			activeTab === tab
				? 'bg-white text-blue-700 shadow'
				: 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
		}`;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div>
					<h2 className="text-2xl font-bold text-gray-900">Life-Safety Reports</h2>
					<p className="mt-1 text-gray-600">Annual equipment inspections and fire drill reports</p>
				</div>
				<div className="flex w-full rounded-lg bg-gray-100 p-1 sm:w-auto" role="tablist" aria-label="Life-safety report type">
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === 'inspections'}
						aria-controls="life-safety-inspections-panel"
						className={`${tabClass('inspections')} flex-1 sm:flex-none`}
						onClick={() => setActiveTab('inspections')}>
						Inspections
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === 'fire-drills'}
						aria-controls="fire-drills-panel"
						className={`${tabClass('fire-drills')} flex-1 sm:flex-none`}
						onClick={() => setActiveTab('fire-drills')}>
						Fire Drills
					</button>
				</div>
			</div>

			<div id="life-safety-inspections-panel" role="tabpanel" hidden={activeTab !== 'inspections'}>
				{activeTab === 'inspections' && <LifeSafetyInspectionWorkspace />}
			</div>
			<div id="fire-drills-panel" role="tabpanel" hidden={activeTab !== 'fire-drills'}>
				{activeTab === 'fire-drills' && <FireDrillWorkspace />}
			</div>
		</div>
	);
}
