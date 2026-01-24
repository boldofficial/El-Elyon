import { NextRequest, NextResponse } from 'next/server';
import { requireCareAccess, requireAdminAccess, requireAdminOrSupervisorAccess } from '@/lib/db-helpers';
import {
  listISPFiles,
  createISPFile,
  activateISPFile,
  deleteISPFile,
} from '@/db/mutations/isp';
import { auth, clerkClient } from '@clerk/nextjs/server';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await requireCareAccess(userId);

    const { searchParams } = new URL(req.url);
    const residentId = searchParams.get('residentId');

    if (!residentId) {
      return NextResponse.json({ error: 'Resident ID is required' }, { status: 400 });
    }

    const ispFiles = await listISPFiles(userId, residentId);
    return NextResponse.json(ispFiles);
  } catch (error: any) {
    console.error('Error listing ISP files:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await requireAdminOrSupervisorAccess(userId); // Only supervisors/admins can create/manage ISP files

    const {
      residentId,
      versionLabel,
      effectiveDate,
      fileStorageId,
      fileName,
      fileSize,
      contentType,
      preparedBy,
      notes,
    } = await req.json();

    if (
      !residentId ||
      !versionLabel ||
      !effectiveDate ||
      !fileStorageId ||
      !fileName ||
      !fileSize ||
      !contentType
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const clerkUser = await (await clerkClient()).users.getUser(userId);
    const uploadedBy = clerkUser.firstName && clerkUser.lastName 
      ? `${clerkUser.firstName} ${clerkUser.lastName}` 
      : clerkUser.username || 'Unknown User';

    const newISPFile = await createISPFile({
      residentId,
      versionLabel,
      effectiveDate,
      fileStorageId,
      fileName,
      fileSize,
      contentType,
      preparedBy,
      notes,
      uploadedBy,
    });

    return NextResponse.json(newISPFile);
  } catch (error: any) {
    console.error('Error creating ISP file:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await requireAdminOrSupervisorAccess(userId); // Only supervisors/admins can activate ISP files

    const { ispFileId } = await req.json();

    if (!ispFileId) {
      return NextResponse.json({ error: 'ISP File ID is required' }, { status: 400 });
    }

    const clerkUser = await (await clerkClient()).users.getUser(userId);
    const activatedBy = clerkUser.firstName && clerkUser.lastName 
      ? `${clerkUser.firstName} ${clerkUser.lastName}` 
      : clerkUser.username || 'Unknown User';

    const activatedISP = await activateISPFile(ispFileId, activatedBy);
    return NextResponse.json(activatedISP);
  } catch (error: any) {
    console.error('Error activating ISP file:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await requireAdminAccess(userId); // Only admins can delete ISP files

    const { ispFileId } = await req.json();

    if (!ispFileId) {
      return NextResponse.json({ error: 'ISP File ID is required' }, { status: 400 });
    }

    await deleteISPFile(ispFileId);
    return NextResponse.json({ message: 'ISP file deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting ISP file:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
