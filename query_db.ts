import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const layouts = await prisma.venueLayout.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: {
      pricingTiers: true,
      sections: {
        include: { pricingTier: true }
      }
    }
  })

  console.log(JSON.stringify(layouts, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
