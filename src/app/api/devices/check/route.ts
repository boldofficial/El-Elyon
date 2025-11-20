// src/app/api/devices/check/route.ts

import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getDeviceByDeviceId} from '@/db/queries/devices';
import {getRoleByClerkId} from '@/db/queries/roles';

export async function GET(req: Request) {
	try {
		const {searchParams} = new URL(req.url);
		const deviceId = searchParams.get('deviceId');

		if (!deviceId) {
			return NextResponse.json({error: 'Device ID required'}, {status: 400});
		}

		// Check if current user is admin
		const {userId} = await auth();
		if (userId) {
			const role = await getRoleByClerkId(userId);

			// ✅ CRITICAL FIX: Admins can login from any device
			if (role?.role === 'admin') {
				console.log('✅ Admin bypass - device check passed');
				return NextResponse.json({
					isRegistered: true,
					isActive: true,
					isAdmin: true,
					deviceName: 'Admin Device (unrestricted)',
					location: 'Any Location',
					message: 'Admin access granted from any device',
				});
			}
		}

		// For non-admins, check device registration
		const device = await getDeviceByDeviceId(deviceId);

		if (!device) {
			console.log('❌ Device not registered:', deviceId);
			return NextResponse.json({
				isRegistered: false,
				isActive: false,
				isAdmin: false,
				message: 'Device not registered. Contact your administrator.',
			});
		}

		console.log('✅ Device check passed:', device.deviceName);
		return NextResponse.json({
			isRegistered: true,
			isActive: device.isActive,
			isAdmin: false,
			deviceName: device.deviceName,
			location: device.location,
			deviceType: device.deviceType,
			message: device.isActive
				? 'Device is active'
				: 'Device is inactive. Contact administrator.',
		});
	} catch (error) {
		console.error('Error checking device:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}

/**
 * Check if a device is registered and active
 * Returns bypass info for admins who can login from anywhere
 */
export async function POST(req: Request) {
	try {
		const {deviceId} = await req.json();

		if (!deviceId) {
			return NextResponse.json({error: 'Device ID required'}, {status: 400});
		}

		// Check if current user is admin
		const {userId} = await auth();
		if (userId) {
			const role = await getRoleByClerkId(userId);

			// ✅ CRITICAL FIX: Admins can login from any device
			if (role?.role === 'admin') {
				console.log('✅ Admin bypass - access granted from any device');
				return NextResponse.json({
					isRegistered: true,
					isActive: true,
					isAdmin: true,
					deviceName: 'Admin Device (unrestricted)',
					location: 'Any Location',
					message: 'Admin access granted from any device',
				});
			}
		}

		// For non-admins, check device registration
		const device = await getDeviceByDeviceId(deviceId);

		if (!device) {
			console.log('❌ Device not registered:', deviceId);
			return NextResponse.json({
				isRegistered: false,
				isActive: false,
				isAdmin: false,
				message: 'Device not registered. Contact your administrator.',
			});
		}

		console.log('📱 Device check:', {
			deviceId,
			isActive: device.isActive,
			deviceName: device.deviceName,
		});

		return NextResponse.json({
			isRegistered: true,
			isActive: device.isActive,
			isAdmin: false,
			deviceName: device.deviceName,
			location: device.location,
			deviceType: device.deviceType,
			message: device.isActive
				? 'Device is active'
				: 'Device is inactive. Contact administrator.',
		});
	} catch (error) {
		console.error('Error checking device:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
