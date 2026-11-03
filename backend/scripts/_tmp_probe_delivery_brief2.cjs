const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

;(async () => {
  const ids = ['alb_svc_mw0uru73_d85703', 'alb_svc_mw0o5nnf_fea1f8']
  for (const id of ids) {
    const a = await p.album.findUnique({
      where: { id },
      select: { id: true, serviceName: true, status: true, contentPackageJson: true },
    })
    if (!a) {
      console.log('missing', id)
      continue
    }
    const nodes = (a.contentPackageJson && a.contentPackageJson.flowNodes) || []
    const d = nodes.find((n) => n && n.kind === 'delivery_photos')
    const r = nodes.find((n) => n && n.kind === 'repair_report')
    console.log('====', a.id, a.status, a.serviceName)
    console.log('delivery has content', Boolean(d && d.content), 'has photoDraft', Boolean(d && d.photoDraft))
    console.log('content keys', d && d.content ? Object.keys(d.content) : [])
    console.log('photoDraft keys', d && d.photoDraft ? Object.keys(d.photoDraft) : [])
    const c = (d && d.content) || {}
    const pd = (d && d.photoDraft) || {}
    console.log('content brief', String(c.repairBrief || '').slice(0, 60), 'faqs', (c.ownerFaqs || []).length)
    console.log('photoDraft brief', String(pd.repairBrief || '').slice(0, 60), 'faqs', (pd.ownerFaqs || []).length)
    console.log(
      'mismatch empty photoDraft vs filled content',
      !String(pd.repairBrief || '').trim() && Boolean(String(c.repairBrief || '').trim()),
    )
    const rc = (r && r.content) || {}
    const rpd = (r && r.photoDraft) || {}
    const rp = (r && r.document && r.document.payload) || {}
    console.log('repair content brief', String(rc.repairBrief || '').slice(0, 40), (rc.ownerFaqs || []).length)
    console.log('repair photoDraft brief', String(rpd.repairBrief || '').slice(0, 40), (rpd.ownerFaqs || []).length)
    console.log('repair payload brief', String(rp.repairBrief || '').slice(0, 40), (rp.ownerFaqs || []).length)
  }
  await p.$disconnect()
})().catch(async (e) => {
  console.error(e)
  await p.$disconnect()
  process.exit(1)
})
