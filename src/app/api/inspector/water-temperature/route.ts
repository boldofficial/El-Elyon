import {getInspectorWaterTemperatureData} from '@/db/queries/inspector';
import {getInspectorSession} from '@/lib/inspector-auth';
import {createInspectorWaterTemperatureHandler} from './handler';

export const GET = createInspectorWaterTemperatureHandler({
	getSession: getInspectorSession,
	getData: getInspectorWaterTemperatureData,
});
