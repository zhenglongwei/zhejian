const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

function bagOf(node) {
  if (!node || typeof node !== 'object') return {}
  if (node.content && typeof node.content === 'object') return node.content
  if (node.photoDraft && typeof node.photoDraft === 'object') return node.photoDraft
  return {}
}

function payloadOf(node) {
  return (node && node.document && node.document.payload) || {}
}

;(async () => {
  const store = await p.store.findFirst({
    where: { name: { contains: '盈商' } },
    select: { id: true, name: true },
  })
  console.log('store', store)
  if (!store) {
    await p.$disconnect()
    return
  }
  const albums = await p.album.findMany({
    where: { storeId: store.id },
    orderBy: { updatedAt: 'desc' },
    take: 8,
    select: {
      id: true,
      serviceName: true,
      status: true,
      updatedAt: true,
      contentPackageJson: true,
    },
  })
  for (const a of albums) {
    const nodes = (a.contentPackageJson && a.contentPackageJson.flowNodes) || []
    const delivery = nodes.find((n) => n && n.kind === 'delivery_photos')
    const repair = nodes.find((n) => n && n.kind === 'repair_report')
    const dContent = bagOf(delivery)
    const dPayload = payloadOf(delivery)
    const rContent = bagOf(repair)
    const rPayload = payloadOf(repair)
    console.log('---', a.id, a.serviceName, a.status, String(a.updatedAt))
    console.log(
      'delivery.status',
      delivery && delivery.status,
      'content.brief',
      String(dContent.repairBrief || '').slice(0, 60),
      'faqs',
      Array.isArray(dContent.ownerFaqs) ? dContent.ownerFaqs.length : 0,
      'payload.brief',
      String(dPayload.repairBrief || '').slice(0, 40),
      'payload.faqs',
      Array.isArray(dPayload.ownerFaqs) ? dPayload.ownerFaqs.length : 0,
    )
    console.log(
      'repair.doc.status',
      repair && repair.document && repair.document.status,
      'content.brief',
      String(rContent.repairBrief || '').slice(0, 60),
      'faqs',
      Array.isArray(rContent.ownerFaqs) ? rContent.ownerFaqs.length : 0,
      'payload.brief',
      String(rPayload.repairBrief || '').slice(0, 60),
      'payload.faqs',
      Array.isArray(rPayload.ownerFaqs) ? rPayload.ownerFaqs.length : 0,
    )
  }
  await p.$disconnect()
})().catch(async (e) => {
  console.error(e)
  await p.$disconnect()
  process.exit(1)
})
