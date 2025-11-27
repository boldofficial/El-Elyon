
// src/app/api/files/download/[id]/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {downloadFile} from '@/lib/neon-storage';

export async function GET(req: NextRequest, {params}: {params: {id: string}}) {
  try {
    const {userId} = await auth();
    if (!userId) {
      return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    const file = await downloadFile(params.id);

    if (!file) {
      return NextResponse.json({error: 'File not found'}, {status: 404});
    }

    // Return file as response with proper headers
    return new NextResponse(file.buffer, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
        'Content-Length': file.buffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error downloading file:', error);
    return NextResponse.json({error: error.message}, {status: 500});
  }
}