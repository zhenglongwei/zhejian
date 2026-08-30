const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function main() {
  const scores = await prisma.geoCheckScore.findMany({ where: { measuredScope: 'none' } })
  for (const s of scores) {
    console.log(s.runId + '  validPlatforms=' + s.validPlatforms + '  planned=' + s.plannedPlatforms + '  conf=' + s.confidence)
  }
}
main().catch(e => { console.error(e.message); process.exit(1) }).finally(() => prisma.$disconnect())
