const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const scores = await prisma.geoCheckScore.findMany({
    where: { measuredScope: 'none' },
    orderBy: { id: 'desc' },
  })
  for (const s of scores) {
    const run = await prisma.geoCheckRun.findUnique({ where: { id: s.runId } })
    const answers = await prisma.geoCheckAnswer.findMany({ where: { runId: s.runId } })
    const statuses = {}
    for (const a of answers) statuses[a.status] = (statuses[a.status] || 0) + 1
    const target = await prisma.geoCheckTarget.findUnique({ where: { id: run.targetId } })
    console.log(s.runId + '  score=' + s.score + '  cov=' + s.coverageRate + '%  平台=' + answers.length + '  ' + JSON.stringify(statuses) + '  ' + (target ? target.name : '(no)'))
  }
  console.log('')
  console.log('共 ' + scores.length + ' 条 none')
}
main().catch(e => { console.error(e.message); process.exit(1) }).finally(() => prisma.$disconnect())
