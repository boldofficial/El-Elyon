import {db} from '../index';
import {kiosks, kioskPairingTokens} from '../schema';
import {eq, InferInsertModel, InferSelectModel} from 'drizzle-orm';

type KioskInsert = InferInsertModel<typeof kiosks>;
type KioskSelect = InferSelectModel<typeof kiosks>;
type KioskUpdate = Partial<KioskInsert>;
type PairingTokenInsert = InferInsertModel<typeof kioskPairingTokens>;
type PairingTokenSelect = InferSelectModel<typeof kioskPairingTokens>;

// Mutation: Insert new kiosk
export async function insertKiosk(data: KioskInsert): Promise<KioskSelect> {
    const [newKiosk] = await db.insert(kiosks).values(data).returning();
    return newKiosk;
}

// Mutation: Update kiosk
export async function updateKiosk(kioskId: string, data: KioskUpdate): Promise<KioskSelect> {
    const updateData = {
        ...data,
        updatedAt: new Date(),
    };

    const [updatedKiosk] = await db
        .update(kiosks)
        .set(updateData)
        .where(eq(kiosks.id, kioskId))
        .returning();

    return updatedKiosk;
}

// Mutation: Update kiosk label
export async function updateKioskLabel(
    kioskId: string,
    deviceLabel: string | undefined
): Promise<KioskSelect> {
    const [updated] = await db
        .update(kiosks)
        .set({deviceLabel})
        .where(eq(kiosks.id, kioskId))
        .returning();

    return updated;
}

// Mutation: Update kiosk status
export async function updateKioskStatus(
    kioskId: string,
    status: 'active' | 'disabled' | 'retired'
): Promise<KioskSelect> {
    const [updated] = await db
        .update(kiosks)
        .set({
            status,
            active: status === 'active',
        })
        .where(eq(kiosks.id, kioskId))
        .returning();

    return updated;
}

// Mutation: Update kiosk last seen timestamp
export async function updateKioskLastSeen(deviceId: string): Promise<KioskSelect> {
    const now = new Date();

    const [updated] = await db
        .update(kiosks)
        .set({
            lastSeenAt: now,
            lastHeartbeat: now,
        })
        .where(eq(kiosks.deviceId, deviceId))
        .returning();

    return updated;
}

// Mutation: Delete kiosk
export async function deleteKiosk(kioskId: string) {
    await db.delete(kiosks).where(eq(kiosks.id, kioskId));
}

// Mutation: Create pairing token
export async function createPairingToken(data: {
    location: string;
    deviceLabel?: string;
    issuedBy: string;
}): Promise<PairingTokenSelect> {
    // Generate 8-character token using uppercase letters and numbers (no confusing chars)
    const token = Array.from({length: 8}, () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        return chars.charAt(Math.floor(Math.random() * chars.length));
    }).join('');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

    const pairingTokenData: PairingTokenInsert = {
        token,
        deviceId: '', // Will be filled when pairing completes
        location: data.location,
        deviceLabel: data.deviceLabel,
        status: 'active',
        issuedBy: data.issuedBy,
        issuedAt: now,
        expiresAt,
    };

    const [pairingToken] = await db
        .insert(kioskPairingTokens)
        .values(pairingTokenData)
        .returning();

    return pairingToken;
}

// Mutation: Complete pairing process
export async function completePairing(data: {
    token: string;
    kioskIdentifier?: string;
}): Promise<{
    deviceId: string;
    location: string;
    deviceLabel: string | undefined;
    kioskId: string;
}> {
    // Find the pairing token
    const pairing = await db.query.kioskPairingTokens.findFirst({
        where: eq(kioskPairingTokens.token, data.token),
    });

    if (!pairing) {
        throw new Error('Invalid pairing token');
    }

    if (pairing.status !== 'active') {
        throw new Error('Token already used or expired');
    }

    if (pairing.expiresAt.getTime() < Date.now()) {
        throw new Error('Token expired');
    }

    // Generate unique device ID
    const deviceId = Array.from({length: 16}, () =>
        Math.floor(Math.random() * 16).toString(16)
    ).join('');

    const now = new Date();

    // Create kiosk record
    const kioskData: KioskInsert = {
        name: data.kioskIdentifier || pairing.deviceLabel || `Kiosk ${deviceId.slice(0, 8)}`,
        deviceId,
        deviceLabel: pairing.deviceLabel ?? undefined,
        location: pairing.location,
        status: 'active',
        active: true,
        registeredAt: now,
        registeredBy: pairing.issuedBy,
        lastSeenAt: now,
        createdAt: now,
        createdBy: pairing.issuedBy,
    };
    const [kiosk] = await db
        .insert(kiosks)
        .values(kioskData)
        .returning();

    // Mark token as used
    await db
        .update(kioskPairingTokens)
        .set({
            deviceId,
            usedAt: now,
            status: 'used',
        })
        .where(eq(kioskPairingTokens.id, pairing.id));

    return {
        deviceId,
        location: pairing.location,
        deviceLabel: pairing.deviceLabel ?? undefined,
        kioskId: kiosk.id,
    };
}

// Mutation: Expire old pairing tokens (cleanup utility)
export async function expireOldPairingTokens(): Promise<PairingTokenSelect[]> {
    const now = new Date();

    const expired = await db
        .update(kioskPairingTokens)
        .set({status: 'expired'})
        .where(eq(kioskPairingTokens.status, 'active'))
        .returning();

    return expired.filter((token) => token.expiresAt.getTime() < now.getTime());
}
