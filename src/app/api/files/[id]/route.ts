
// src/app/api/files/[id]/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {getFileMetadata, deleteFile} from '@/lib/neon-storage';
import {requireAdminAccess} from '@/lib/db-helpers';

// GET file metadata
export async function GET(req: NextRequest, {params}: {params: {id: string}}) {
  try {
    const {userId} = await auth();
    if (!userId) {
      return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    const metadata = await getFileMetadata(params.id);

    if (!metadata) {
      return NextResponse.json({error: 'File not found'}, {status: 404});
    }

    return NextResponse.json(metadata);
  } catch (error: any) {
    console.error('Error getting file metadata:', error);
    return NextResponse.json({error: error.message}, {status: 500});
  }
}

// DELETE file
export async function DELETE(
  req: NextRequest,
  {params}: {params: {id: string}}
) {
  try {
    const {userId} = await auth();
    if (!userId) {
      return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    await requireAdminAccess(userId);

    await deleteFile(params.id);

    return NextResponse.json({success: true});
  } catch (error: any) {
    console.error('Error deleting file:', error);
    return NextResponse.json({error: error.message}, {status: 500});
  }
}
