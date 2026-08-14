const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const layouts = await prisma.venueLayout.findMany({
    include: {
      sections: true,
      pricingTiers: true
    },
    orderBy: { updatedAt: 'desc' },
    take: 1
  });
  
  if (layouts.length > 0) {
    const layout = layouts[0];
    console.log(`Latest layout: ${layout.name} (ID: ${layout.id})`);
    console.log(`Updated At: ${layout.updatedAt}`);
    console.log(`Sections:`);
    for (const sec of layout.sections) {
      console.log(`  ${sec.name}: pricingTierId=${sec.pricingTierId}, price=${sec.price}, color=${sec.color}`);
    }
  } else {
    console.log('No layouts found.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
