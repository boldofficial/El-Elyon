import { NextRequest, NextResponse } from 'next/server';
import { requireCareAccess } from '@/lib/db-helpers';
import { db } from '../../../../../db';
import { residentDocuments, residents } from '../../../../../db/schema';
import { auth, currentUser } from '@clerk/nextjs/server';
import { eq, desc, and, inArray } from 'drizzle-orm';

// GET all documents or filtered by residentId
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRole = await requireCareAccess(userId);

    const { searchParams } = new URL(req.url);
    const residentId = searchParams.get('residentId');

    // Build query
    let query = db
      .select({
        id: residentDocuments.id,
        residentId: residentDocuments.residentId,
        residentName: residents.name,
        title: residentDocuments.title,
        type: residentDocuments.type,
        fileName: residentDocuments.fileName,
        fileSize: residentDocuments.fileSize,
        fileStorageId: residentDocuments.fileStorageId,
        uploadedAt: residentDocuments.uploadedAt,
        uploadedBy: residentDocuments.uploadedBy,
        description: residentDocuments.description,
      })
      .from(residentDocuments)
      .leftJoin(residents, eq(residentDocuments.residentId, residents.id))
      .orderBy(desc(residentDocuments.uploadedAt));
    
    // Apply filters
    if (residentId) {
        // @ts-ignore
        query = query.where(eq(residentDocuments.residentId, residentId));
    } else {
         if (userRole.role !== 'admin') {
             const userLocations = userRole.locations || [];
             if (userLocations.length > 0) {
                 // @ts-ignore
                 query = query.where(inArray(residents.location, userLocations));
             } else {
                 // No locations assigned? Return nothing or authorized failure?
                 // For safety return empty by impossible condition
                 // @ts-ignore
                 query = query.where(eq(residents.id, 'impossible'));
             }
         }
    }

    const docs = await query;
    return NextResponse.json(docs);
  } catch (error: any) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

// POST create new document
export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      residentId,
      title,
      type,
      fileStorageId,
      fileName,
      fileSize,
      contentType,
      description,
    } = body;

    // Validation
    if (!residentId || !title || !fileStorageId || !fileName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const userName = `${user.firstName} ${user.lastName}`;

    const [newDoc] = await db.insert(residentDocuments).values({
      residentId,
      title,
      type: type || 'other',
      fileStorageId,
      fileName,
      fileSize,
      contentType,
      description,
      uploadedBy: userName || user.emailAddresses[0].emailAddress,
    }).returning();

    return NextResponse.json(newDoc);
  } catch (error: any) {
    console.error('Error creating document:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create document' },
      { status: 500 }
    );
  }
}

// DELETE document
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }

    await db.delete(residentDocuments).where(eq(residentDocuments.id, documentId));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete document' },
      { status: 500 }
    );
  }
}
