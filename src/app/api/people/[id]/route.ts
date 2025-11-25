// src/app/api/people/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/db-helpers';
import { deleteResident } from '@/db/mutations/people'; // Assuming this mutation exists or will be created
import { auth } from '@clerk/nextjs/server';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await requireAdminAccess(userId);

    const residentId = params.id;
    if (!residentId) {
      return NextResponse.json({ error: 'Resident ID is required' }, { status: 400 });
    }

    await deleteResident(residentId);
    return NextResponse.json({ message: 'Resident deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting resident:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Placeholder for GET, PUT, POST if needed in the future for specific resident operations
export async function GET() {
  return NextResponse.json({ message: 'GET method not implemented for specific resident' }, { status: 501 });
}

export async function PUT() {
  return NextResponse.json({ message: 'PUT method not implemented for specific resident' }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ message: 'POST method not implemented for specific resident' }, { status: 501 });
}
