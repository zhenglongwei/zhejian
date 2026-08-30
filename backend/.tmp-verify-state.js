const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.geoCheckScore.findMany({
    select: { id: true, channel: true, score: true, visibilityScore: true, foundationScore: true, measuredScope: true },
  })
  const by = (fn) => rows.filter(fn).length
  console.log('=== 全部评分记录 ===')
  console.log('总数            :', rows.length)
  console.log('BROWSER         :', by(r => r.channel === 'BROWSER'))
  console.log('API             :', by(r => r.channel === 'API'))
  console.log('')
  console.log('=== 三条口径纪律 ===')
  console.log('BROWSER 且 measuredScope=visibility :', by(r => r.channel === 'BROWSER' && r.measuredScope === 'visibility'), '(必须为 0)')
  console.log('BROWSER 且 measuredScope=foundation :', by(r => r.channel === 'BROWSER' && r.measuredScope === 'foundation'))
  console.log('BROWSER 且 visibilityScore 非空     :', by(r => r.channel === 'BROWSER' && r.visibilityScore !== null), '(必须为 0)')
  console.log('BROWSER 且 foundationScore 为空     :', by(r => r.channel === 'BROWSER' && r.foundationScore === null))
  console.log('')
  console.log('=== measuredScope 分布 ===')
  const dist = {}
  for (const r of rows) {
    const k = `${r.channel} / ${r.measuredScope}`
    dist[k] = (dist[k] || 0) + 1
  }
  for (const [k, v] of Object.entries(dist).sort()) console.log(k.padEnd(28), v)
}

main().catch(e => { console.error(e.message); process.exit(1) }).finally(() => prisma.$disconnect())
