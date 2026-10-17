const test = require('node:test')
const assert = require('node:assert/strict')
const { buildStandardFlowNodes, requiresOwnerConfirm } = require('../constants/service-flow-nodes')
const { buildFlowProgressView, isFlowNodeDone } = require('./service-flow-progress')
const { presentMerchantTimeline } = require('./merchant-flow-steps')
const { applyAddonInsert, reopenWorkBesideOpenAddon } = require('./service-flow-addon-insert')
const {
  collectInspectionReportGaps,
  collectQuoteConfirmGaps,
  collectDeliveryPhotoDraftGaps,
  collectWorkPhotoDraftGaps,
  buildRepairReportPayload,
  parseAmount,
} = require('./service-flow-docs')

function activeKind(nodes) {
  const view = buildFlowProgressView(nodes)
  return view.activeNode ? view.activeNode.kind : ''
}

function unlockNext(nodes, index) {
  const next = nodes[index + 1]
  if (next && (next.status === 'locked' || next.status === 'pending')) next.status = 'in_progress'
}

function completePhoto(nodes, kind) {
  const index = nodes.findIndex((n) => n.kind === kind && n.status !== 'completed')
  assert.ok(index >= 0, `找不到未完成的${kind}`)
  nodes[index].status = 'completed'
  unlockNext(nodes, index)
  return index
}

function confirmQuote(nodes, node) {
  node.status = 'completed'
  node.document = { ...node.document, status: 'confirmed' }
  unlockNext(nodes, nodes.findIndex((n) => n.id === node.id))
}

function quoteTotal(nodes) {
  return nodes
    .filter(
      (n) =>
        (n.kind === 'quote_confirm' || n.kind === 'addon_quote_confirm') &&
        String((n.document && n.document.status) || '') === 'confirmed',
    )
    .reduce((sum, n) => {
      const lines = (n.document && n.document.payload && n.document.payload.lines) || []
      return sum + lines.reduce((s, line) => s + (Number(line && line.amount) || 0), 0)
    }, 0)
}

function declaredWorkAmounts(nodes) {
  const out = []
  nodes
    .filter((n) => n.kind === 'work')
    .forEach((n) => {
      const findings = (n.photoDraft && n.photoDraft.findings) || []
      findings.forEach((row) => {
        const amount = parseAmount(row && row.amount)
        if (amount != null) out.push(amount)
      })
    })
  return out
}

function deliveryAmountBlocked(nodes) {
  const declared = declaredWorkAmounts(nodes)
  if (!declared.length) return false
  const sheet = declared.reduce((s, v) => s + v, 0)
  return Math.abs(sheet - quoteTotal(nodes)) > 0.01
}

function workItemNames(nodes) {
  return nodes
    .filter((n) => n.kind === 'work')
    .flatMap((n) => ((n.photoDraft && n.photoDraft.findings) || []).map((row) => row.partName))
    .filter(Boolean)
}

test('从接车到交车，施工中可以连续报两次新故障', () => {
  const nodes = buildStandardFlowNodes()
  assert.equal(activeKind(nodes), 'intake')
  assert.equal(requiresOwnerConfirm({ kind: 'intake', document: { docType: 'intake_confirm' } }), false)

  completePhoto(nodes, 'intake')
  nodes[0].document = {
    docType: 'intake_confirm',
    status: 'delivered',
    payload: { photos: ['p1'], mileageKm: '12000', chiefComplaint: '底盘异响' },
  }
  assert.equal(isFlowNodeDone(nodes[0]), true)
  assert.equal(activeKind(nodes), 'inspection')

  const inspect = nodes.find((n) => n.kind === 'inspection')
  inspect.photoDraft = {
    findings: [{ id: 'f-arm', partName: '下摆臂', result: '需处理', advice: '胶套开裂', images: [{ url: 'arm.jpg' }] }],
  }
  completePhoto(nodes, 'inspection')
  const report = nodes.find((n) => n.kind === 'inspection_report')
  report.status = 'in_progress'
  report.document = {
    docType: 'inspection_report',
    status: 'draft',
    payload: {
      chiefComplaint: '底盘异响',
      findings: inspect.photoDraft.findings,
    },
  }
  assert.equal(collectInspectionReportGaps(report.document.payload).length, 0)
  assert.equal(activeKind(nodes), 'inspection_report')

  report.document.status = 'delivered'
  const firstQuote = nodes.find((n) => n.kind === 'quote_confirm' && !n.insertedReason)
  assert.equal(firstQuote.status, 'locked')
  firstQuote.status = 'in_progress'
  firstQuote.document = {
    ...firstQuote.document,
    status: 'draft',
    payload: {
      lines: [{ name: '更换机油', amount: 260, note: '全合成' }],
    },
  }
  assert.equal(activeKind(nodes), 'quote_confirm')
  assert.equal(collectQuoteConfirmGaps(firstQuote.document.payload).length, 0)
  firstQuote.document.status = 'pending_confirm'
  assert.equal(isFlowNodeDone(firstQuote), false)
  assert.equal(nodes.find((n) => n.kind === 'work').status, 'locked')
  assert.equal(requiresOwnerConfirm(firstQuote), true)

  confirmQuote(nodes, firstQuote)
  const work = nodes.find((n) => n.kind === 'work')
  assert.equal(work.status, 'in_progress')
  work.photoDraft = {
    findings: [
      { id: 'w-oil', partName: '更换机油', outsideQuote: false, images: [{ url: 'oil.jpg' }], amount: '' },
      {
        id: 'w-arm',
        partName: '下摆臂胶套',
        caption: '衬套开裂',
        outsideQuote: true,
        images: [{ url: 'arm.jpg' }],
        amount: '',
      },
    ],
  }

  const firstAddon = applyAddonInsert(nodes, { now: 101 })
  assert.equal(firstAddon.error, '')
  assert.equal(firstAddon.seeded, true)
  const afterFirst = firstAddon.nodes
  const kept = afterFirst.find((n) => n.id === work.id)
  assert.equal(kept.status, 'in_progress')
  assert.deepEqual(
    kept.photoDraft.findings.map((row) => row.partName),
    ['更换机油', '下摆臂胶套'],
  )
  const addon = afterFirst.find((n) => n.id === 'fn_addon_q_101')
  assert.equal(addon.title, '施工中新发现')
  assert.equal(addon.document.payload.lines.length, 1)
  assert.equal(addon.document.payload.lines[0].name, '下摆臂胶套')
  assert.equal(addon.document.payload.lines[0].amount, '')
  assert.equal(addon.document.payload.discovery.images[0], 'arm.jpg')
  assert.equal(afterFirst.some((n) => n.id === 'fn_addon_work_101'), false)
  assert.equal(activeKind(afterFirst), 'work')
  assert.equal(afterFirst.find((n) => n.kind === 'delivery_photos').status, 'locked')

  const blocked = collectQuoteConfirmGaps(addon.document.payload, { requireDiscovery: true })
  assert.ok(blocked.some((line) => line.includes('金额')))
  addon.document.payload.lines[0].amount = 180
  assert.equal(collectQuoteConfirmGaps(addon.document.payload, { requireDiscovery: true }).length, 0)
  confirmQuote(afterFirst, addon)
  assert.equal(kept.status, 'in_progress')
  assert.equal(activeKind(afterFirst), 'work')
  const arm = kept.photoDraft.findings.find((row) => row.id === 'w-arm')
  arm.outsideQuote = false
  kept.photoDraft.findings.push({
    id: 'w-disc',
    partName: '制动盘',
    caption: '盘面起槽',
    outsideQuote: true,
    images: [{ url: 'disc.jpg' }],
    amount: '',
  })
  const secondAddon = applyAddonInsert(afterFirst, { now: 202 })
  assert.equal(secondAddon.seeded, true)
  const afterSecond = secondAddon.nodes
  const again = afterSecond.find((n) => n.id === 'fn_addon_q_202')
  assert.deepEqual(
    again.document.payload.lines.map((line) => line.name),
    ['制动盘'],
  )
  assert.equal(afterSecond.filter((n) => n.insertedReason === 'addon' && n.kind === 'quote_confirm').length, 2)
  again.document.payload.lines[0].amount = 90
  confirmQuote(afterSecond, again)
  const sameWork = afterSecond.find((n) => n.id === work.id)
  assert.equal(sameWork.status, 'in_progress')
  sameWork.photoDraft.findings.push({
    id: 'w-disc-new',
    partName: '换新制动盘',
    outsideQuote: false,
    images: [{ url: 'disc-new.jpg' }],
    amount: '',
  })
  assert.equal(collectWorkPhotoDraftGaps(sameWork.photoDraft).length, 0)
  completePhoto(afterSecond, 'work')
  assert.equal(activeKind(afterSecond), 'delivery_photos')
  assert.equal(quoteTotal(afterSecond), 260 + 180 + 90)
  assert.equal(deliveryAmountBlocked(afterSecond), false)
  assert.deepEqual(workItemNames(afterSecond), ['更换机油', '下摆臂胶套', '制动盘', '换新制动盘'])

  const delivery = afterSecond.find((n) => n.kind === 'delivery_photos')
  delivery.photoDraft = { warrantyPeriod: '6个月或1万公里', deliveryExteriorUrl: 'out.jpg' }
  assert.equal(collectDeliveryPhotoDraftGaps(delivery.photoDraft).length, 0)
  completePhoto(afterSecond, 'delivery_photos')
  const repair = afterSecond.find((n) => n.kind === 'repair_report')
  const reportPayload = buildRepairReportPayload({
    chiefComplaint: '底盘异响',
    workItems: workItemNames(afterSecond).map((name) => ({ name })),
    totalAmount: quoteTotal(afterSecond),
    photoDraft: delivery.photoDraft,
  })
  repair.document = { docType: 'repair_report', status: 'pending_confirm', payload: reportPayload }
  assert.equal(reportPayload.totalAmount, 530)
  assert.equal(isFlowNodeDone(repair), false)
  assert.equal(requiresOwnerConfirm(repair), true)
  confirmQuote(afterSecond, repair)
  assert.equal(buildFlowProgressView(afterSecond).allDone, true)

  const timeline = presentMerchantTimeline(afterSecond, null)
  const titles = timeline.completed.map((row) => row.title)
  assert.ok(titles.filter((title) => title.includes('报价')).length >= 2)
  assert.ok(titles.filter((title) => title.includes('施工')).length >= 1)
  assert.equal(nodes.find((n) => n.kind === 'quote_confirm' && !n.insertedReason).title, '方案确认')
})

test('已经收成完成的原施工，在补充报价还没确认时改回施工中', () => {
  const healed = reopenWorkBesideOpenAddon([
    {
      id: 'w1',
      kind: 'work',
      sortOrder: 0,
      status: 'completed',
      photoDraft: { findings: [{ id: 'f1', partName: '拆检', images: [{ url: 'a.jpg' }] }] },
    },
    {
      id: 'q1',
      kind: 'quote_confirm',
      sortOrder: 1,
      insertedReason: 'addon',
      parentNodeId: 'w1',
      document: { status: 'draft', payload: { lines: [] } },
    },
    {
      id: 'w2',
      kind: 'work',
      sortOrder: 2,
      status: 'locked',
      insertedReason: 'addon',
      parentNodeId: 'q1',
      photoDraft: { findings: [] },
    },
  ])
  assert.equal(healed.changed, true)
  assert.equal(healed.nodes.find((node) => node.id === 'w1').status, 'in_progress')
  assert.equal(healed.nodes.some((node) => node.id === 'w2'), false)
  assert.equal(healed.nodes.find((node) => node.id === 'w1').photoDraft.findings[0].partName, '拆检')
})

test('工单金额没把增项算进去时，交车对账会拦住', () => {
  const nodes = buildStandardFlowNodes()
  const quote = nodes.find((n) => n.kind === 'quote_confirm')
  quote.document = { status: 'confirmed', payload: { lines: [{ name: '更换机油', amount: 260 }] } }
  const work = nodes.find((n) => n.kind === 'work')
  work.photoDraft = { findings: [{ partName: '更换机油', amount: 260 }] }
  const inserted = applyAddonInsert(
    nodes.map((n) => (n.kind === 'work' ? { ...n, status: 'in_progress' } : n)),
    { now: 303 },
  )
  const addon = inserted.nodes.find((n) => n.id === 'fn_addon_q_303')
  addon.document.status = 'confirmed'
  addon.document.payload.lines[0].amount = 180
  assert.equal(deliveryAmountBlocked(inserted.nodes), true)
})
