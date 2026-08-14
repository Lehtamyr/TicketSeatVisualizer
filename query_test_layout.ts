import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const layout = await prisma.venueLayout.findUnique({
    where: { id: 'fc1ea14b-c12f-4a45-928d-bdaf091ce84f' },
    include: { sections: true }
  })

  console.log(JSON.stringify(layout, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
