import {getInspectorLifeSafetyData} from '@/db/queries/inspector';
import {getInspectorSession} from '@/lib/inspector-auth';
import {createInspectorLifeSafetyHandler} from './handler';

export const GET = createInspectorLifeSafetyHandler({
	getSession: getInspectorSession,
	getData: getInspectorLifeSafetyData,
});
