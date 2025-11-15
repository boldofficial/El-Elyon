import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireCareAccess, logAudit} from '../../../../lib/db-helpers';
import {listResidentsByLocation, listAllResidents, getGuardianChecklistTemplates} from '../../../../db/queries/people';
import {insertResident} from '../../../../db/mutations/people';
import {insertGuardian} from '../../../../db/mutations/guardians';
import {db} from '../../../../db';
import {guardianChecklistLinks, guardianChecklistTemplates} from '../../../../db/schema'; // For direct DB insert and typing
import {v4 as uuidv4} from 'uuid'; // For generating tokens
import {InferSelectModel} from 'drizzle-orm';

type GuardianChecklistTemplateSelect = InferSelectModel<typeof guardianChecklistTemplates>;

export async function GET(request: Request) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireCareAccess(userId);

        const {searchParams} = new URL(request.url);
        const location = searchParams.get('location');

        let residents;
        if (location) {
            residents = await listResidentsByLocation(location);
        } else {
            residents = await listAllResidents();
        }

        return NextResponse.json(residents);
    } catch (error: any) {
        await logAudit({
            clerkUserId: userId,
            event: 'GET_RESIDENTS_FAILED',
            details: error.message,
            deviceId: 'system', // Placeholder, actual deviceId might be passed in headers
            location: '', // Placeholder, actual location might be passed in headers
        });
        return NextResponse.json({error: error.message}, {status: 500});
    }
}

export async function POST(request: Request) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireCareAccess(userId);

        const body = await request.json();
        const {name, location, dateOfBirth, guardians, generateChecklist} = body;

        if (!name || !location || !dateOfBirth) {
            return NextResponse.json({error: 'Missing required fields: name, location, dateOfBirth'}, {status: 400});
        }

        const newResident = await insertResident({
            name,
            location,
            dateOfBirth,
            createdBy: userId,
        });

        if (guardians && guardians.length > 0) {
            for (const guardianData of guardians) {
                const newGuardian = await insertGuardian({
                    ...guardianData,
                    createdBy: userId,
                    residentIds: [newResident.id], // Link new resident to guardian
                });

                if (generateChecklist) {
                    const templates = await getGuardianChecklistTemplates();
                    const defaultTemplate = templates.find((t: GuardianChecklistTemplateSelect) => t.active); // Assuming an active template

                    if (defaultTemplate) {
                        const token = uuidv4();
                        const expiresAt = new Date();
                        expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

                        await db.insert(guardianChecklistLinks).values({
                            residentId: newResident.id,
                            templateId: defaultTemplate.id,
                            guardianEmail: newGuardian.email,
                            token,
                            sentDate: new Date(),
                            sentBy: userId,
                            expiresAt,
                            completed: false,
                        });

                        // Call the existing email API route
                        // This would typically be an internal fetch or a direct function call if within the same service layer
                        // For now, we'll just log that it would be called.
                        console.log(`Would send guardian checklist email to ${newGuardian.email} with token ${token}`);
                        // In a real scenario, you'd make an internal fetch request:
                        // await fetch(`${process.env.SITE_URL}/api/internal/compliance/send-guardian-checklist-email`, {
                        //     method: 'POST',
                        //     headers: {'Content-Type': 'application/json'},
                        //     body: JSON.stringify({
                        //         guardianEmail: newGuardian.email,
                        //         residentName: newResident.name,
                        //         token,
                        //         // other necessary details
                        //     }),
                        // });
                    }
                }
            }
        }

        await logAudit({
            clerkUserId: userId,
            event: 'CREATE_RESIDENT_SUCCESS',
            details: `Resident ${newResident.name} created.`,
            deviceId: 'system', // Placeholder
            location: location, // Use provided location
        });
        return NextResponse.json({id: newResident.id}, {status: 201});
    } catch (error: any) {
        await logAudit({
            clerkUserId: userId,
            event: 'CREATE_RESIDENT_FAILED',
            details: error.message,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({error: error.message}, {status: 500});
    }
}
