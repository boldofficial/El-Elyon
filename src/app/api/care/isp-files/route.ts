import { NextRequest, NextResponse } from 'next/server';
import { requireCareAccess, requireAdminAccess, requireAdminOrSupervisorAccess } from '@/lib/db-helpers';
import {internalServerError} from '@/lib/api-errors';
import {
  listISPFiles,
  createISPFile,
  activateISPFile,
  deleteISPFile,
  updateISPFile,
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

    // Allow listing all files if residentId is not provided (handled by listISPFiles authorization)
    const ispFiles = await listISPFiles(userId, residentId || undefined);
    return NextResponse.json(ispFiles);
  } catch (error) {
    return internalServerError(error, 'ListISPFiles');
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
  } catch (error) {
    return internalServerError(error, 'CreateISPFile');
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
  } catch (error) {
    return internalServerError(error, 'ActivateISPFile');
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
  } catch (error) {
    return internalServerError(error, 'DeleteISPFile');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await requireAdminOrSupervisorAccess(userId); // Only supervisors/admins can edit ISP files

    const { ispFileId, versionLabel, effectiveDate, notes, preparedBy } = await req.json();

    if (!ispFileId) {
      return NextResponse.json({ error: 'ISP File ID is required' }, { status: 400 });
    }

    const updatedISP = await updateISPFile(ispFileId, {
      versionLabel,
      effectiveDate,
      notes,
      preparedBy,
    });
    return NextResponse.json(updatedISP);
  } catch (error) {
    return internalServerError(error, 'UpdateISPFile');
  }
}
