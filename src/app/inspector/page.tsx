import {Toaster} from 'sonner';
import InspectorDashboard from '@/components/inspector/InspectorDashboard';

export const metadata = {
	title: 'Inspector Access',
};

export default function InspectorPage() {
	return (
		<>
			<Toaster position="top-center" />
			<InspectorDashboard />
		</>
	);
}
