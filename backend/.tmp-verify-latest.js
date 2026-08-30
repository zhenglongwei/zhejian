const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const targets = await prisma.geoCheckTarget.findMany({ where: { visible: true } })
  let hit = 0
  for (const t of targets) {
    const scores = await prisma.geoCheckScore.findMany({
      where: { targetId: t.id, channel: 'BROWSER' },
      orderBy: { computedAt: 'desc' },
    })
    if (!scores.length) continue
    const latest = scores[0]
    const best = scores.filter(s => s.foundationScore != null || s.visibilityScore != null)
    if (latest.foundationScore == null && latest.visibilityScore == null && best.length) {
      hit++
      console.log('[风险] ' + t.name)
      console.log('   最新批次 ' + latest.runId + '  score=' + latest.score + ' cov=' + latest.coverageRate + '% 有效平台=' + latest.validPlatforms)
      console.log('   但名下另有可用批次 ' + best.length + ' 条，最高分 ' + Math.max(...best.map(s => s.foundationScore ?? s.visibilityScore)))
    }
  }
  console.log('')
  console.log('最新批次为空批次的门店数: ' + hit + ' / ' + targets.length)
}
main().catch(e => { console.error(e.message); process.exit(1) }).finally(() => prisma.$disconnect())
