const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  const id = 'alb_svc_mw0uru73_d85703'
  const a = await p.album.findUnique({ where: { id }, select: { contentPackageJson: true } })
  const nodes = (a.contentPackageJson && a.contentPackageJson.flowNodes) || []
  const d = nodes.find((n) => n && n.kind === 'delivery_photos')
  console.log('deliveryAdvice', JSON.stringify(d && d.deliveryAdvice, null, 2))
  console.log('content.repairBrief', d && d.content && d.content.repairBrief)
  console.log('content.ownerFaqs', JSON.stringify(d && d.content && d.content.ownerFaqs, null, 2))
  await p.$disconnect()
})().catch(async (e) => { console.error(e); await p.$disconnect(); process.exit(1) })
