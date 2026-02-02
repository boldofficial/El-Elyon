
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createFireEvacPlan, listFireEvacPlans } from '@/db/mutations/fire-evac';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const residentId = searchParams.get('residentId');

    if (!residentId) {
      return NextResponse.json({ error: 'Resident ID is required' }, { status: 400 });
    }

    const plans = await listFireEvacPlans(userId, residentId);
    return NextResponse.json(plans);
  } catch (error: any) {
    console.error('Error fetching fire evac plans:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      residentId,
      fileStorageId,
      fileName,
      fileSize,
      contentType,
      mobilityNeeds,
      assistanceRequired,
      medicalEquipment,
      specialInstructions,
      notes,
    } = body;

    if (!residentId || !fileStorageId || !fileName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const newPlan = await createFireEvacPlan({
      residentId,
      fileStorageId,
      fileName,
      fileSize,
      contentType,
      mobilityNeeds,
      assistanceRequired,
      medicalEquipment,
      specialInstructions,
      notes,
      uploadedBy: userId,
    });

    return NextResponse.json(newPlan);
  } catch (error: any) {
    console.error('Error creating fire evac plan:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
