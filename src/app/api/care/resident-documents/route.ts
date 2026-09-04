import { NextRequest, NextResponse } from 'next/server';
import { requireCareAccess } from '@/lib/db-helpers';
import { db } from '../../../../../db';
import { residentDocuments, residents, ispFiles, fireEvac } from '../../../../../db/schema';
import { auth, currentUser } from '@clerk/nextjs/server';
import { eq, desc, and, inArray, sql, SQL } from 'drizzle-orm';
import { searchCondition, offsetSlice } from '@/db/query-helpers';

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
    const sourceFilter = searchParams.get('source'); // 'generic' | 'isp' | 'fire_evac'
    const search = searchParams.get('search')?.trim();
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : undefined;
    const limit = parsedLimit !== undefined && Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;
    const parsedOffset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

    // 1. Generic Documents
    let docsQuery = db
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
        source: sql<'generic' | 'isp' | 'fire_evac'>`'generic'`,
      })
      .from(residentDocuments)
      .leftJoin(residents, eq(residentDocuments.residentId, residents.id));

    // 2. ISP Files
    let ispQuery = db
      .select({
        id: ispFiles.id,
        residentId: ispFiles.residentId,
        residentName: residents.name,
        title: ispFiles.versionLabel, // Map versionLabel to title
        type: sql<string>`'ISP'`,
        fileName: ispFiles.fileName,
        fileSize: ispFiles.fileSize,
        fileStorageId: ispFiles.fileStorageId,
        uploadedAt: ispFiles.uploadedAt,
        uploadedBy: ispFiles.uploadedBy,
        description: ispFiles.notes,
        source: sql<'generic' | 'isp' | 'fire_evac'>`'isp'`,
      })
      .from(ispFiles)
      .leftJoin(residents, eq(ispFiles.residentId, residents.id));

    // 3. Fire Evac Plans
    let fireEvacQuery = db
        .select({
            id: fireEvac.id,
            residentId: fireEvac.residentId,
            residentName: residents.name,
            // Map version to title essentially
            title: sql<string>`'Fire Evac Plan (v' || ${fireEvac.version} || ')'`, 
            type: sql<string>`'Fire Evac'`, 
            fileName: fireEvac.fileName,
            fileSize: fireEvac.fileSize,
            fileStorageId: fireEvac.fileStorageId,
            uploadedAt: fireEvac.createdAt, // createdAt matches uploadedAt concept
            uploadedBy: fireEvac.createdBy,
            description: fireEvac.notes,
            source: sql<'generic' | 'isp' | 'fire_evac'>`'fire_evac'`,
        })
        .from(fireEvac)
        .leftJoin(residents, eq(fireEvac.residentId, residents.id));

    // Apply Filters and Execute
    const docsConditions: SQL[] = [];
    const ispConditions: SQL[] = [];
    const fireEvacConditions: SQL[] = [];

    // Non-admins are scoped to their assigned locations regardless of whether
    // residentId is present -- otherwise a caller could pass another facility's
    // residentId and read that resident's documents/ISP/fire-evac files.
    if (userRole.role !== 'admin') {
        const userLocations = userRole.locations || [];
        const locationCondition = userLocations.length > 0
            ? inArray(residents.location, userLocations)
            : eq(residents.id, 'impossible');
        docsConditions.push(locationCondition);
        ispConditions.push(locationCondition);
        fireEvacConditions.push(locationCondition);
    }

    if (residentId) {
        docsConditions.push(eq(residentDocuments.residentId, residentId));
        ispConditions.push(eq(ispFiles.residentId, residentId));
        fireEvacConditions.push(eq(fireEvac.residentId, residentId));
    }

    const docsSearchClause = searchCondition(search, [
        residentDocuments.title,
        residentDocuments.description,
        residentDocuments.fileName,
    ]);
    if (docsSearchClause) docsConditions.push(docsSearchClause);

    const ispSearchClause = searchCondition(search, [
        ispFiles.versionLabel,
        ispFiles.notes,
        ispFiles.fileName,
    ]);
    if (ispSearchClause) ispConditions.push(ispSearchClause);

    const fireEvacSearchClause = searchCondition(search, [fireEvac.notes, fireEvac.fileName]);
    if (fireEvacSearchClause) fireEvacConditions.push(fireEvacSearchClause);

    if (docsConditions.length > 0) {
        // @ts-expect-error - drizzle's dynamic query builder chaining isn't typed for reassignment
        docsQuery = docsQuery.where(and(...docsConditions));
    }
    if (ispConditions.length > 0) {
        // @ts-expect-error - drizzle's dynamic query builder chaining isn't typed for reassignment
        ispQuery = ispQuery.where(and(...ispConditions));
    }
    if (fireEvacConditions.length > 0) {
        // @ts-expect-error - drizzle's dynamic query builder chaining isn't typed for reassignment
        fireEvacQuery = fireEvacQuery.where(and(...fireEvacConditions));
    }

    // Skip subqueries excluded by the source filter entirely rather than
    // fetching and discarding them, since limit/offset below assumes the
    // merged set only contains rows the caller actually asked for.
    const [docs, isps, fireEvacs] = await Promise.all([
        !sourceFilter || sourceFilter === 'generic' ? docsQuery : Promise.resolve([]),
        !sourceFilter || sourceFilter === 'isp' ? ispQuery : Promise.resolve([]),
        !sourceFilter || sourceFilter === 'fire_evac' ? fireEvacQuery : Promise.resolve([]),
    ]);

    // Combine and Sort
    const allDocs = [...docs, ...isps, ...fireEvacs].sort((a, b) => {
        const dateA = new Date(a.uploadedAt || 0).getTime();
        const dateB = new Date(b.uploadedAt || 0).getTime();
        return dateB - dateA; // Descending
    });

    const {items: pageDocs, hasMore} =
      limit !== undefined ? offsetSlice(allDocs, offset, limit) : {items: allDocs, hasMore: false};

    const response = NextResponse.json(pageDocs);
    response.headers.set('X-Has-More', String(hasMore));
    return response;
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
