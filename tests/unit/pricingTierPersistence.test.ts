import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { saveLayoutAction, getLayoutById, getLayouts } from '@/actions/saveLayout';
import { SaveLayoutInput } from '@/types/venue';

describe('Pricing Tier Persistence & Omission Verification (R1 & R2)', () => {
  let createdLayoutIds: string[] = [];

  afterAll(async () => {
    // Cleanup any created test layouts
    for (const id of createdLayoutIds) {
      try {
        await prisma.venueLayout.delete({ where: { id } });
      } catch {
        // ignore cleanup errors
      }
    }
    await prisma.$disconnect();
  });

  it('1. Saving a layout with assigned pricing tier persists valid pricingTierId on Section and Seats', async () => {
    const input: SaveLayoutInput = {
      name: 'Test Layout - Tier Assigned',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [
        {
          id: 'tier-vip-test',
          name: 'VIP Test',
          color: '#f59e0b',
          basePrice: 150,
          description: 'VIP description',
        },
      ],
      sections: [
        {
          name: 'VIP Section',
          code: 'VIP1',
          shapeType: 'RECTANGLE',
          geometry: {
            shapeType: 'RECTANGLE',
            points: [
              { x: 100, y: 100 },
              { x: 300, y: 100 },
              { x: 300, y: 250 },
              { x: 100, y: 250 },
            ],
          },
          price: 150,
          color: '#f59e0b',
          tierId: 'tier-vip-test',
          rowCount: 3,
          seatsPerRow: 4,
          seats: [
            { row: 'A', number: 1, x: 120, y: 120 },
            { row: 'A', number: 2, x: 150, y: 120 },
            { row: 'B', number: 1, x: 120, y: 160 },
          ],
        },
      ],
    };

    const res = await saveLayoutAction(input);
    expect(res.success).toBe(true);
    expect(res.layoutId).toBeDefined();
    createdLayoutIds.push(res.layoutId!);

    // Query DB directly
    const layoutInDb = await prisma.venueLayout.findUnique({
      where: { id: res.layoutId! },
      include: {
        pricingTiers: true,
        sections: {
          include: { seats: true, pricingTier: true },
        },
      },
    });

    expect(layoutInDb).not.toBeNull();
    expect(layoutInDb!.pricingTiers.length).toBe(1);
    const dbTier = layoutInDb!.pricingTiers[0];
    expect(dbTier.name).toBe('VIP Test');
    expect(dbTier.basePrice).toBe(150);

    expect(layoutInDb!.sections.length).toBe(1);
    const dbSection = layoutInDb!.sections[0];
    expect(dbSection.pricingTierId).toBe(dbTier.id);
    expect(dbSection.pricingTier).not.toBeNull();
    expect(dbSection.pricingTier?.name).toBe('VIP Test');

    // Verify seats inherit the section's pricingTierId
    expect(dbSection.seats.length).toBe(3);
    for (const seat of dbSection.seats) {
      expect(seat.pricingTierId).toBe(dbTier.id);
    }
  });

  it('2. Saving a layout with unassigned/unlinked section stores pricingTierId = null on Section and Seats', async () => {
    const input: SaveLayoutInput = {
      name: 'Test Layout - Unassigned Tier',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [
        {
          id: 'tier-unused',
          name: 'Unused Tier',
          color: '#10b981',
          basePrice: 50,
        },
      ],
      sections: [
        {
          name: 'General Section (No Tier)',
          code: 'GEN1',
          shapeType: 'RECTANGLE',
          geometry: {
            shapeType: 'RECTANGLE',
            points: [
              { x: 100, y: 100 },
              { x: 300, y: 100 },
              { x: 300, y: 250 },
              { x: 100, y: 250 },
            ],
          },
          price: 50,
          color: '#10b981',
          tierId: undefined, // Unassigned
          rowCount: 2,
          seatsPerRow: 2,
          seats: [
            { row: 'A', number: 1, x: 120, y: 120 },
            { row: 'A', number: 2, x: 150, y: 120 },
          ],
        },
      ],
    };

    const res = await saveLayoutAction(input);
    expect(res.success).toBe(true);
    expect(res.layoutId).toBeDefined();
    createdLayoutIds.push(res.layoutId!);

    // Query DB directly
    const layoutInDb = await prisma.venueLayout.findUnique({
      where: { id: res.layoutId! },
      include: {
        pricingTiers: true,
        sections: {
          include: { seats: true, pricingTier: true },
        },
      },
    });

    expect(layoutInDb).not.toBeNull();
    const dbSection = layoutInDb!.sections[0];
    expect(dbSection.pricingTierId).toBeNull();
    expect(dbSection.pricingTier).toBeNull();

    // Verify seats have pricingTierId = null
    expect(dbSection.seats.length).toBe(2);
    for (const seat of dbSection.seats) {
      expect(seat.pricingTierId).toBeNull();
    }
  });

  it('3. STAGE sections always store pricingTierId = null and have 0 seats', async () => {
    const input: SaveLayoutInput = {
      name: 'Test Layout - Stage Landmark',
      canvasWidth: 1200,
      canvasHeight: 800,
      pricingTiers: [
        {
          id: 'tier-stage-ignore',
          name: 'VIP',
          color: '#f59e0b',
          basePrice: 200,
        },
      ],
      sections: [
        {
          name: 'Main Stage',
          code: 'STAGE',
          shapeType: 'STAGE',
          geometry: {
            shapeType: 'STAGE',
            points: [
              { x: 300, y: 50 },
              { x: 700, y: 50 },
              { x: 700, y: 150 },
              { x: 300, y: 150 },
            ],
          },
          price: 0,
          color: '#312e81',
          tierId: 'tier-stage-ignore', // Even if mistakenly passed, STAGE must override to null
          rowCount: 8,
          seatsPerRow: 12,
          seats: [
            { row: 'A', number: 1, x: 350, y: 75 }, // Even if seats are mistakenly sent
          ],
        },
      ],
    };

    const res = await saveLayoutAction(input);
    expect(res.success).toBe(true);
    expect(res.layoutId).toBeDefined();
    createdLayoutIds.push(res.layoutId!);

    const layoutInDb = await prisma.venueLayout.findUnique({
      where: { id: res.layoutId! },
      include: {
        sections: {
          include: { seats: true, pricingTier: true },
        },
      },
    });

    expect(layoutInDb).not.toBeNull();
    const stageSec = layoutInDb!.sections[0];
    expect(stageSec.shapeType).toBe('STAGE');
    expect(stageSec.pricingTierId).toBeNull();
    expect(stageSec.pricingTier).toBeNull();
    expect(stageSec.price).toBe(0);
    expect(stageSec.rowCount).toBe(0);
    expect(stageSec.seatsPerRow).toBe(0);
    expect(stageSec.seats.length).toBe(0);
  });

  it('4. Mixed layout with assigned, unassigned, and STAGE sections persists all correctly', async () => {
    const input: SaveLayoutInput = {
      name: 'Test Mixed Layout',
      canvasWidth: 1200,
      canvasHeight: 800,
      pricingTiers: [
        { id: 'tier-vip-m', name: 'VIP', color: '#f59e0b', basePrice: 200 },
        { id: 'tier-eco-m', name: 'Economy', color: '#10b981', basePrice: 40 },
      ],
      sections: [
        // 1. Stage landmark
        {
          name: 'Stage Area',
          code: 'STAGE',
          shapeType: 'STAGE',
          geometry: {
            shapeType: 'STAGE',
            points: [{ x: 400, y: 50 }, { x: 800, y: 50 }, { x: 800, y: 150 }, { x: 400, y: 150 }],
          },
          price: 0,
          color: '#312e81',
          rowCount: 0,
          seatsPerRow: 0,
          seats: [],
        },
        // 2. VIP assigned
        {
          name: 'VIP Front',
          code: 'VIP',
          shapeType: 'RECTANGLE',
          geometry: {
            shapeType: 'RECTANGLE',
            points: [{ x: 200, y: 200 }, { x: 500, y: 200 }, { x: 500, y: 400 }, { x: 200, y: 400 }],
          },
          price: 200,
          color: '#f59e0b',
          tierId: 'tier-vip-m',
          rowCount: 2,
          seatsPerRow: 2,
          seats: [
            { row: 'A', number: 1, x: 250, y: 250 },
            { row: 'A', number: 2, x: 350, y: 250 },
          ],
        },
        // 3. Unassigned
        {
          name: 'Standing GA (Unassigned)',
          code: 'GA',
          shapeType: 'RECTANGLE',
          geometry: {
            shapeType: 'RECTANGLE',
            points: [{ x: 600, y: 200 }, { x: 900, y: 200 }, { x: 900, y: 400 }, { x: 600, y: 400 }],
          },
          price: 50,
          color: '#94a3b8',
          rowCount: 2,
          seatsPerRow: 2,
          seats: [
            { row: 'A', number: 1, x: 650, y: 250 },
            { row: 'A', number: 2, x: 750, y: 250 },
          ],
        },
      ],
    };

    const res = await saveLayoutAction(input);
    expect(res.success).toBe(true);
    createdLayoutIds.push(res.layoutId!);

    const layout = await getLayoutById(res.layoutId!);
    expect(layout).not.toBeNull();
    expect(layout!.pricingTiers.length).toBe(2);

    const vipTier = layout!.pricingTiers.find((t) => t.name === 'VIP')!;
    const stageSec = layout!.sections.find((s) => s.shapeType === 'STAGE')!;
    const vipSec = layout!.sections.find((s) => s.name === 'VIP Front')!;
    const gaSec = layout!.sections.find((s) => s.name === 'Standing GA (Unassigned)')!;

    // Stage
    expect(stageSec.pricingTierId).toBeNull();
    expect(stageSec.seats.length).toBe(0);

    // VIP
    expect(vipSec.pricingTierId).toBe(vipTier.id);
    expect(vipSec.seats.length).toBe(2);
    vipSec.seats.forEach((seat) => expect(seat.pricingTierId).toBe(vipTier.id));

    // GA
    expect(gaSec.pricingTierId).toBeNull();
    expect(gaSec.seats.length).toBe(2);
    gaSec.seats.forEach((seat) => expect(seat.pricingTierId).toBeNull());
  });

  it('5. Updating an existing layout: reassigning tiers and unlinking tiers updates database accurately', async () => {
    // Step 1: Create initial layout with 1 VIP tier and 2 sections
    const initialInput: SaveLayoutInput = {
      name: 'Layout for Update Test',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [
        { id: 'tier-gold', name: 'Gold', color: '#eab308', basePrice: 100 },
        { id: 'tier-silver', name: 'Silver', color: '#94a3b8', basePrice: 60 },
      ],
      sections: [
        {
          name: 'Section Alpha',
          code: 'ALP',
          shapeType: 'RECTANGLE',
          geometry: { shapeType: 'RECTANGLE', points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }] },
          price: 100,
          color: '#eab308',
          tierId: 'tier-gold',
          rowCount: 2,
          seatsPerRow: 2,
          seats: [{ row: 'A', number: 1, x: 150, y: 150 }, { row: 'A', number: 2, x: 250, y: 150 }],
        },
        {
          name: 'Section Beta',
          code: 'BET',
          shapeType: 'RECTANGLE',
          geometry: { shapeType: 'RECTANGLE', points: [{ x: 400, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 300 }, { x: 400, y: 300 }] },
          price: 60,
          color: '#94a3b8',
          tierId: 'tier-silver',
          rowCount: 2,
          seatsPerRow: 2,
          seats: [{ row: 'A', number: 1, x: 450, y: 150 }, { row: 'A', number: 2, x: 550, y: 150 }],
        },
      ],
    };

    const createRes = await saveLayoutAction(initialInput);
    expect(createRes.success).toBe(true);
    const layoutId = createRes.layoutId!;
    createdLayoutIds.push(layoutId);

    const layoutAfterCreate = await getLayoutById(layoutId);
    const goldTierId = layoutAfterCreate!.pricingTiers.find((t) => t.name === 'Gold')!.id;
    const silverTierId = layoutAfterCreate!.pricingTiers.find((t) => t.name === 'Silver')!.id;

    // Step 2: Update layout — unassign Section Alpha (tierId = undefined), and switch Section Beta to Gold
    const updateInput: SaveLayoutInput = {
      layoutId,
      name: 'Layout for Update Test - Modified',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [
        { id: goldTierId, name: 'Gold Tier Renamed', color: '#eab308', basePrice: 120 },
        { id: silverTierId, name: 'Silver', color: '#94a3b8', basePrice: 60 },
      ],
      sections: [
        {
          name: 'Section Alpha (Unassigned)',
          code: 'ALP',
          shapeType: 'RECTANGLE',
          geometry: { shapeType: 'RECTANGLE', points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }] },
          price: 50,
          color: '#cbd5e1',
          tierId: undefined, // UNASSIGNED
          rowCount: 2,
          seatsPerRow: 2,
          seats: [{ row: 'A', number: 1, x: 150, y: 150 }, { row: 'A', number: 2, x: 250, y: 150 }],
        },
        {
          name: 'Section Beta (Switched to Gold)',
          code: 'BET',
          shapeType: 'RECTANGLE',
          geometry: { shapeType: 'RECTANGLE', points: [{ x: 400, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 300 }, { x: 400, y: 300 }] },
          price: 120,
          color: '#eab308',
          tierId: goldTierId, // SWITCHED TO GOLD
          rowCount: 2,
          seatsPerRow: 2,
          seats: [{ row: 'A', number: 1, x: 450, y: 150 }, { row: 'A', number: 2, x: 550, y: 150 }],
        },
      ],
    };

    const updateRes = await saveLayoutAction(updateInput);
    expect(updateRes.success).toBe(true);

    const layoutAfterUpdate = await getLayoutById(layoutId);
    expect(layoutAfterUpdate!.name).toBe('Layout for Update Test - Modified');

    const updatedGoldTier = layoutAfterUpdate!.pricingTiers.find((t) => t.id === goldTierId)!;
    expect(updatedGoldTier.name).toBe('Gold Tier Renamed');
    expect(updatedGoldTier.basePrice).toBe(120);

    const updatedAlpha = layoutAfterUpdate!.sections.find((s) => s.code === 'ALP')!;
    expect(updatedAlpha.pricingTierId).toBeNull();
    updatedAlpha.seats.forEach((seat) => expect(seat.pricingTierId).toBeNull());

    const updatedBeta = layoutAfterUpdate!.sections.find((s) => s.code === 'BET')!;
    expect(updatedBeta.pricingTierId).toBe(goldTierId);
    updatedBeta.seats.forEach((seat) => expect(seat.pricingTierId).toBe(goldTierId));
  });

  it('6. getLayouts and getLayoutById include pricingTiers and section relations', async () => {
    const layouts = await getLayouts();
    expect(Array.isArray(layouts)).toBe(true);
    expect(layouts.length).toBeGreaterThan(0);
  });

  it('7. Explicitly sending empty pricingTiers: [] deletes all tiers and clears section/seat pricingTierId', async () => {
    const initialInput: SaveLayoutInput = {
      name: 'Layout Tier Deletion Test',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [{ id: 'tier-to-delete', name: 'Will Be Deleted', color: '#ef4444', basePrice: 80 }],
      sections: [
        {
          name: 'Section Linked',
          code: 'LNK',
          shapeType: 'RECTANGLE',
          geometry: { shapeType: 'RECTANGLE', points: [{ x: 50, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 200 }, { x: 50, y: 200 }] },
          price: 80,
          color: '#ef4444',
          tierId: 'tier-to-delete',
          rowCount: 2,
          seatsPerRow: 2,
          seats: [{ row: 'A', number: 1, x: 100, y: 100 }],
        },
      ],
    };

    const res1 = await saveLayoutAction(initialInput);
    expect(res1.success).toBe(true);
    const layoutId = res1.layoutId!;
    createdLayoutIds.push(layoutId);

    // Update with pricingTiers: []
    const updateInput: SaveLayoutInput = {
      layoutId,
      name: 'Layout Tier Deletion Test - Tiers Deleted',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [], // Explicit empty array -> delete all tiers
      sections: [
        {
          name: 'Section Linked',
          code: 'LNK',
          shapeType: 'RECTANGLE',
          geometry: { shapeType: 'RECTANGLE', points: [{ x: 50, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 200 }, { x: 50, y: 200 }] },
          price: 50,
          color: '#3b82f6',
          tierId: 'tier-to-delete', // Old deleted tier
          rowCount: 2,
          seatsPerRow: 2,
          seats: [{ row: 'A', number: 1, x: 100, y: 100 }],
        },
      ],
    };

    const res2 = await saveLayoutAction(updateInput);
    expect(res2.success).toBe(true);

    const layout = await getLayoutById(layoutId);
    expect(layout!.pricingTiers.length).toBe(0);
    const sec = layout!.sections[0];
    expect(sec.pricingTierId).toBeNull();
    expect(sec.seats[0].pricingTierId).toBeNull();
  });

  it('8. Cross-layout isolation: section in Layout B attempting to link to tier in Layout A resolves to null', async () => {
    // 1. Create Layout A with tier A
    const layoutAInput: SaveLayoutInput = {
      name: 'Layout A - Isolation',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [{ id: 'tier-layout-a', name: 'Layout A VIP', color: '#f59e0b', basePrice: 300 }],
      sections: [
        {
          name: 'Sec A',
          code: 'A1',
          shapeType: 'RECTANGLE',
          geometry: { shapeType: 'RECTANGLE', points: [{ x: 50, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 200 }, { x: 50, y: 200 }] },
          price: 300,
          color: '#f59e0b',
          tierId: 'tier-layout-a',
          rowCount: 2,
          seatsPerRow: 2,
          seats: [{ row: 'A', number: 1, x: 100, y: 100 }],
        },
      ],
    };
    const resA = await saveLayoutAction(layoutAInput);
    expect(resA.success).toBe(true);
    createdLayoutIds.push(resA.layoutId!);

    const layoutA = await getLayoutById(resA.layoutId!);
    const tierAId = layoutA!.pricingTiers[0].id;

    // 2. Create Layout B, attempting to use tierAId without defining it in Layout B's pricingTiers
    const layoutBInput: SaveLayoutInput = {
      name: 'Layout B - Trying to hijack Tier A',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [{ id: 'tier-layout-b', name: 'Layout B Standard', color: '#10b981', basePrice: 50 }],
      sections: [
        {
          name: 'Sec B (Hijacker)',
          code: 'B1',
          shapeType: 'RECTANGLE',
          geometry: { shapeType: 'RECTANGLE', points: [{ x: 50, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 200 }, { x: 50, y: 200 }] },
          price: 300,
          color: '#f59e0b',
          tierId: tierAId, // From Layout A!
          rowCount: 2,
          seatsPerRow: 2,
          seats: [{ row: 'A', number: 1, x: 100, y: 100 }],
        },
      ],
    };
    const resB = await saveLayoutAction(layoutBInput);
    expect(resB.success).toBe(true);
    createdLayoutIds.push(resB.layoutId!);

    const layoutB = await getLayoutById(resB.layoutId!);
    const secB = layoutB!.sections[0];
    // Must NOT link to Layout A's tier
    expect(secB.pricingTierId).toBeNull();
    expect(secB.seats[0].pricingTierId).toBeNull();
  });

  it('9. Automatic seat generation with stringified JSON geometry inherits assigned pricingTierId', async () => {
    const input: SaveLayoutInput = {
      name: 'Layout Auto Gen Seats With Tier',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [{ id: 'tier-auto-gen', name: 'Auto Tier', color: '#6366f1', basePrice: 95 }],
      sections: [
        {
          name: 'Auto Gen Section',
          code: 'AG1',
          shapeType: 'RECTANGLE',
          geometry: JSON.stringify({
            shapeType: 'RECTANGLE',
            x: 100,
            y: 100,
            width: 200,
            height: 150,
            points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 250 }, { x: 100, y: 250 }],
          }) as any,
          price: 95,
          color: '#6366f1',
          tierId: 'tier-auto-gen',
          rowCount: 3,
          seatsPerRow: 4,
          seats: [], // Empty -> triggers generateSeatGrid
        },
      ],
    };

    const res = await saveLayoutAction(input);
    expect(res.success).toBe(true);
    createdLayoutIds.push(res.layoutId!);

    const layout = await getLayoutById(res.layoutId!);
    const tierId = layout!.pricingTiers[0].id;
    const sec = layout!.sections[0];

    expect(sec.pricingTierId).toBe(tierId);
    expect(sec.seats.length).toBeGreaterThan(0);
    for (const seat of sec.seats) {
      expect(seat.pricingTierId).toBe(tierId);
    }
  });

  it('10. STAGE landmark with stringified JSON geometry and assigned tierId forces pricingTierId = null and 0 seats', async () => {
    const input: SaveLayoutInput = {
      name: 'Layout Stage Geometry String Test',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [{ id: 'tier-vip-stage', name: 'VIP', color: '#f59e0b', basePrice: 200 }],
      sections: [
        {
          name: 'Stage Landmark',
          code: 'STAGE',
          shapeType: 'STAGE',
          geometry: JSON.stringify({
            shapeType: 'STAGE',
            points: [{ x: 200, y: 20 }, { x: 600, y: 20 }, { x: 600, y: 120 }, { x: 200, y: 120 }],
          }) as any,
          price: 200,
          color: '#312e81',
          tierId: 'tier-vip-stage',
          rowCount: 5,
          seatsPerRow: 5,
          seats: [{ row: 'A', number: 1, x: 250, y: 50 }],
        },
      ],
    };

    const res = await saveLayoutAction(input);
    expect(res.success).toBe(true);
    createdLayoutIds.push(res.layoutId!);

    const layout = await getLayoutById(res.layoutId!);
    const stageSec = layout!.sections[0];
    expect(stageSec.shapeType).toBe('STAGE');
    expect(stageSec.pricingTierId).toBeNull();
    expect(stageSec.price).toBe(0);
    expect(stageSec.rowCount).toBe(0);
    expect(stageSec.seatsPerRow).toBe(0);
    expect(stageSec.seats.length).toBe(0);
  });

  it('11. Section payload with direct pricingTierId property correctly resolves to PricingTier', async () => {
    const input: any = {
      name: 'Layout Direct pricingTierId Field Test',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [{ id: 'tier-direct-field', name: 'Direct Field Tier', color: '#14b8a6', basePrice: 110 }],
      sections: [
        {
          name: 'Direct Section',
          code: 'DIR',
          shapeType: 'RECTANGLE',
          geometry: {
            shapeType: 'RECTANGLE',
            points: [{ x: 50, y: 50 }, { x: 250, y: 50 }, { x: 250, y: 200 }, { x: 50, y: 200 }],
          },
          price: 110,
          color: '#14b8a6',
          pricingTierId: 'tier-direct-field', // Direct field without tierId
          rowCount: 2,
          seatsPerRow: 3,
          seats: [],
        },
      ],
    };

    const res = await saveLayoutAction(input);
    expect(res.success).toBe(true);
    createdLayoutIds.push(res.layoutId!);

    const layout = await getLayoutById(res.layoutId!);
    const tierId = layout!.pricingTiers[0].id;
    const sec = layout!.sections[0];
    expect(sec.pricingTierId).toBe(tierId);
    expect(sec.seats.length).toBeGreaterThan(0);
    for (const seat of sec.seats) {
      expect(seat.pricingTierId).toBe(tierId);
    }
  });

  it('12. Sentinel tier strings ("none", "null", "undefined", "   ") resolve to pricingTierId = null', async () => {
    const input: any = {
      name: 'Layout Sentinel Strings Test',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [{ id: 'tier-sample', name: 'Sample', color: '#6366f1', basePrice: 50 }],
      sections: [
        {
          name: 'Section None',
          code: 'NON',
          shapeType: 'RECTANGLE',
          geometry: { shapeType: 'RECTANGLE', points: [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 }] },
          price: 50,
          color: '#6366f1',
          tierId: 'none',
          rowCount: 1,
          seatsPerRow: 1,
          seats: [{ row: 'A', number: 1, x: 75, y: 75 }],
        },
        {
          name: 'Section Null String',
          code: 'NUL',
          shapeType: 'RECTANGLE',
          geometry: { shapeType: 'RECTANGLE', points: [{ x: 200, y: 50 }, { x: 300, y: 50 }, { x: 300, y: 150 }, { x: 200, y: 150 }] },
          price: 50,
          color: '#6366f1',
          tierId: 'null',
          rowCount: 1,
          seatsPerRow: 1,
          seats: [{ row: 'A', number: 1, x: 225, y: 75 }],
        },
        {
          name: 'Section Whitespace',
          code: 'WHT',
          shapeType: 'RECTANGLE',
          geometry: { shapeType: 'RECTANGLE', points: [{ x: 350, y: 50 }, { x: 450, y: 50 }, { x: 450, y: 150 }, { x: 350, y: 150 }] },
          price: 50,
          color: '#6366f1',
          tierId: '   ',
          rowCount: 1,
          seatsPerRow: 1,
          seats: [{ row: 'A', number: 1, x: 375, y: 75 }],
        },
      ],
    };

    const res = await saveLayoutAction(input);
    expect(res.success).toBe(true);
    createdLayoutIds.push(res.layoutId!);

    const layout = await getLayoutById(res.layoutId!);
    for (const sec of layout!.sections) {
      expect(sec.pricingTierId).toBeNull();
      expect(sec.seats[0].pricingTierId).toBeNull();
    }
  });

  it('13. Updating layout grid dimensions with auto seat re-generation preserves pricingTierId on new seats', async () => {
    // Create initial layout
    const initialInput: SaveLayoutInput = {
      name: 'Layout Grid Resize Test',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [{ id: 'tier-resize-test', name: 'Resize Tier', color: '#ec4899', basePrice: 85 }],
      sections: [
        {
          name: 'Resizable Section',
          code: 'RSZ',
          shapeType: 'RECTANGLE',
          geometry: { shapeType: 'RECTANGLE', points: [{ x: 100, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 300 }, { x: 100, y: 300 }] },
          price: 85,
          color: '#ec4899',
          tierId: 'tier-resize-test',
          rowCount: 2,
          seatsPerRow: 2,
          seats: [], // Auto-gen 4 seats
        },
      ],
    };

    const res1 = await saveLayoutAction(initialInput);
    expect(res1.success).toBe(true);
    const layoutId = res1.layoutId!;
    createdLayoutIds.push(layoutId);

    const layout1 = await getLayoutById(layoutId);
    expect(layout1!.sections[0].seats.length).toBe(4);
    const tierId = layout1!.pricingTiers[0].id;

    // Update with 4 rows x 5 seatsPerRow
    const updateInput: SaveLayoutInput = {
      layoutId,
      name: 'Layout Grid Resize Test - Resized',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [{ id: tierId, name: 'Resize Tier', color: '#ec4899', basePrice: 85 }],
      sections: [
        {
          name: 'Resizable Section',
          code: 'RSZ',
          shapeType: 'RECTANGLE',
          geometry: { shapeType: 'RECTANGLE', points: [{ x: 100, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 300 }, { x: 100, y: 300 }] },
          price: 85,
          color: '#ec4899',
          tierId: tierId,
          rowCount: 4,
          seatsPerRow: 5,
          seats: [], // Trigger auto-gen for updated dimensions
        },
      ],
    };

    const res2 = await saveLayoutAction(updateInput);
    expect(res2.success).toBe(true);

    const layout2 = await getLayoutById(layoutId);
    const updatedSec = layout2!.sections[0];
    expect(updatedSec.pricingTierId).toBe(tierId);
    expect(updatedSec.seats.length).toBe(20);
    for (const seat of updatedSec.seats) {
      expect(seat.pricingTierId).toBe(tierId);
    }
  });

  it('14. Layout cascade deletion cleanly removes pricing tiers, sections, and seats', async () => {
    const input: SaveLayoutInput = {
      name: 'Layout For Deletion Test',
      canvasWidth: 1000,
      canvasHeight: 700,
      pricingTiers: [{ id: 'tier-to-be-cascaded', name: 'Cascade Tier', color: '#8b5cf6', basePrice: 70 }],
      sections: [
        {
          name: 'Cascade Section',
          code: 'CAS',
          shapeType: 'RECTANGLE',
          geometry: { shapeType: 'RECTANGLE', points: [{ x: 50, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 200 }, { x: 50, y: 200 }] },
          price: 70,
          color: '#8b5cf6',
          tierId: 'tier-to-be-cascaded',
          rowCount: 2,
          seatsPerRow: 2,
          seats: [{ row: 'A', number: 1, x: 75, y: 75 }],
        },
      ],
    };

    const res = await saveLayoutAction(input);
    expect(res.success).toBe(true);
    const layoutId = res.layoutId!;

    // Confirm existence
    const beforeDel = await getLayoutById(layoutId);
    expect(beforeDel).not.toBeNull();
    expect(beforeDel!.pricingTiers.length).toBe(1);
    expect(beforeDel!.sections.length).toBe(1);
    expect(beforeDel!.sections[0].seats.length).toBe(1);

    // Delete layout
    await prisma.venueLayout.delete({ where: { id: layoutId } });

    // Confirm cascade
    const afterDel = await getLayoutById(layoutId);
    expect(afterDel).toBeNull();

    const orphanTiers = await prisma.pricingTier.findMany({ where: { layoutId } });
    expect(orphanTiers.length).toBe(0);

    const orphanSections = await prisma.section.findMany({ where: { layoutId } });
    expect(orphanSections.length).toBe(0);
  });
});
