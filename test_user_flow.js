const TEST_URL = 'http://localhost:3000/api/layouts';

async function main() {
  const res1 = await fetch(TEST_URL + '?layoutId=5dddaf54-1f85-4114-bba4-5e05d90ed1a3');
  const data1 = await res1.json();
  const layout = data1.data;
  
  const pricingTiers = layout.pricingTiers;
  const sections = layout.sections.map(s => ({
    name: s.name,
    code: s.code,
    shapeType: s.shapeType,
    geometry: typeof s.geometry === 'string' ? JSON.parse(s.geometry) : s.geometry,
    price: s.price,
    color: s.color,
    rowCount: s.rowCount,
    seatsPerRow: s.seatsPerRow,
    tierId: s.pricingTierId || undefined,
    seats: []
  }));

  // User selects Gold Tier for Section 1
  const goldTier = pricingTiers.find(t => t.name === 'Gold');
  sections[0].tierId = goldTier.id;
  sections[0].price = goldTier.basePrice;
  sections[0].color = goldTier.color;

  const res2 = await fetch(TEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      layoutId: layout.id,
      name: layout.name,
      canvasWidth: layout.canvasWidth,
      canvasHeight: layout.canvasHeight,
      sections,
      pricingTiers
    })
  });
  
  const data2 = await res2.json();
  console.log("POST result:", JSON.stringify(data2, null, 2));

  // Query DB directly to check what happened
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const dbLayout = await prisma.venueLayout.findUnique({
    where: { id: layout.id },
    include: { sections: true }
  });
  console.log("DB layout:", JSON.stringify(dbLayout, null, 2));
}

main().catch(console.error);
