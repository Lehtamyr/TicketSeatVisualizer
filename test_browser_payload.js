const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

async function test() {
  const prisma = new PrismaClient();
  const tx = prisma;

  const layout = await tx.venueLayout.create({
    data: { name: 'Test Browser Payload', canvasWidth: 1000, canvasHeight: 700 }
  });

  const tierIdMap = {};
  const tId = 'tier-gold';
  const targetId = crypto.randomUUID();
  tierIdMap[tId] = targetId;

  await tx.pricingTier.create({
    data: {
      id: targetId,
      layoutId: layout.id,
      name: 'Gold',
      color: '#eab308',
      basePrice: 1500000
    }
  });

  const secTierId = 'tier-gold';
  
  const section = await tx.section.create({
    data: {
      layoutId: layout.id,
      name: 'Section 1',
      code: 'S1',
      shapeType: 'RECTANGLE',
      geometry: '{}',
      price: 1500000,
      color: '#eab308',
      rowCount: 5,
      seatsPerRow: 5,
      pricingTierId: tierIdMap[secTierId] || secTierId
    }
  });

  console.log('Section created:', section);
}

test().catch(console.error);
