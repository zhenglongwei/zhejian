const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildOwnerFlowView,
  healFinishReportPackage,
  migrateFlowPackageOnce,
  mergeConfirmPayload,
} = require('./service-flow.service')
const {
  migrateNodeToSingleContent,
  contentOfFlowNode,
  collectQuoteConfirmGaps,
} = require('../../../utils/service-flow-docs')
const {
  buildOwnerPreviewDoc,
  previewAlbumOf,
  workItemsFromFindings,
} = require('../../../utils/owner-preview-doc')

function albumWithFlow(flowNodes) {
  return {
    storeName: '测试店',
    vehicleJson: { plate: '浙A12345', brand: '大众', series: '朗逸' },
    vehicleDisplay: '大众 朗逸',
    contentPackageJson: {
      flowVersion: 6,
      flowNodes,
    },
  }
}

test('单据已发给车主但节点仍 locked/pending：车主仍可见（送达状态为真源）', () => {
  // 真实序列：报价在检测完成的同一会话里发出、商家未整页刷新 → quote 节点在库里仍是 locked
  const view = buildOwnerFlowView(
    albumWithFlow([
      {
        id: 'intake_1',
        kind: 'intake',
        title: '接车',
        sortOrder: 1,
        status: 'pending',
        content: {
          chiefComplaint: '到店检查异响',
          pendingImages: [{ url: 'https://cdn.example.com/intake-front.jpg' }],
        },
        document: { docType: 'intake_confirm', status: 'delivered' },
      },
      {
        id: 'quote_1',
        kind: 'quote_confirm',
        title: '方案确认',
        sortOrder: 4,
        status: 'locked',
        document: {
          docType: 'quote_confirm',
          status: 'pending_confirm',
          payload: { lines: [{ name: '更换前刹车片', amount: 480 }] },
        },
      },
    ]),
    [],
  )
  const intake = view.docs.find((row) => row && row.kind === 'intake')
  assert.ok(intake)
  assert.equal(intake.locked, false)
  const quote = view.docs.find((row) => row && row.kind === 'quote_confirm')
  assert.ok(quote)
  assert.equal(quote.locked, false)
  assert.equal(quote.needsConfirm, true)
})

test('车主维修工单：封存 workItems 为空时回落施工记录图和说明', () => {
  const view = buildOwnerFlowView(
    albumWithFlow([
      {
        id: 'work_1',
        kind: 'work',
        title: '维修工单',
        sortOrder: 4,
        status: 'completed',
        content: {
          findings: [
            {
              partName: '右前门',
              caption: '补漆并更换饰条',
              brand: '原厂',
              images: [{ url: 'https://cdn.example.com/work-door.jpg' }],
            },
          ],
          workerName: '张工',
          finishedAt: '2026-11-01',
        },
        document: {
          docType: 'work',
          status: 'completed',
          payload: {
            workItems: [],
            workerName: '张工',
          },
        },
      },
    ]),
    [],
  )
  const work = view.docs.find((row) => row && row.kind === 'work')
  assert.ok(work)
  assert.equal(work.locked, false)
  assert.equal(work.items.length, 1)
  assert.equal(work.items[0].name, '右前门')
  assert.equal(work.items[0].note, '补漆并更换饰条')
  assert.equal(work.items[0].brand, '原厂')
  assert.equal(work.items[0].images.length, 1)
  assert.match(work.items[0].images[0].url, /work-door\.jpg/)

  const expected = buildOwnerPreviewDoc({
    family: 'work',
    album: previewAlbumOf(albumWithFlow([])),
    workItems: workItemsFromFindings([
      {
        partName: '右前门',
        caption: '补漆并更换饰条',
        brand: '原厂',
        images: [{ url: 'https://cdn.example.com/work-door.jpg' }],
      },
    ]),
  }).doc
  assert.equal(work.items[0].name, expected.items[0].name)
  assert.equal(work.items[0].note, expected.items[0].note)
  assert.equal(work.items[0].brand, expected.items[0].brand)
  assert.equal(work.items[0].images[0].url, expected.items[0].images[0].url)
})

test('车主交车报告：只读已生成正文', () => {
  const payload = {
    repairBrief: '右前门补漆完成，饰条已换新。',
    ownerFaqs: [{ id: 'faq_1', question: '几天可以洗车？', answer: '48 小时后再洗。' }],
    acceptanceItems: [
      { id: 'acc_1', name: '右前门', standard: '自然光下无明显色差', method: '目视', result: 'pass' },
    ],
    deliveryPhotos: [
      { url: 'https://cdn.example.com/finish-front.jpg' },
      { url: 'https://cdn.example.com/finish-side.jpg' },
    ],
    workItems: [{ name: '右前门', note: '补漆并更换饰条', amount: 800 }],
    warrantyPeriod: '12 个月',
    warrantyNotes: '不含事故损伤',
    delivererName: '李店长',
    totalAmount: 800,
  }
  const view = buildOwnerFlowView(
    albumWithFlow([
      {
        id: 'repair_1',
        kind: 'repair_report',
        title: '交车报告',
        sortOrder: 6,
        status: 'in_progress',
        document: {
          docType: 'repair_report',
          status: 'pending_confirm',
          payload,
        },
      },
    ]),
    [],
  )
  const repair = view.docs.find((row) => row && row.kind === 'repair_report')
  assert.ok(repair)
  // 交车报告不展示简述/问答，只展示逐项验收与外观照
  assert.equal(repair.repairBrief, undefined)
  assert.equal(repair.ownerFaqs, undefined)
  assert.equal(repair.acceptanceItems.length, 1)
  assert.equal(repair.acceptanceItems[0].name, '右前门')
  assert.equal(repair.acceptanceItems[0].resultLabel, '合格')
  assert.equal(repair.workItems.length, 1)
  assert.equal(repair.workItems[0].name, '右前门')
  assert.equal(Number(repair.workItems[0].amount), 800)
  assert.equal(repair.deliveryPhotos.length, 2)
  assert.equal(repair.warrantyNotes, '不含事故损伤')
  assert.equal(repair.signName, '李店长')

  const expected = buildOwnerPreviewDoc({
    family: 'finish',
    album: previewAlbumOf(albumWithFlow([])),
    workItems: payload.workItems,
    totalAmount: 800,
    deliveryPhotos: payload.deliveryPhotos,
    acceptanceItems: payload.acceptanceItems,
    warrantyPeriod: payload.warrantyPeriod,
    warrantyNotes: payload.warrantyNotes,
    signName: payload.delivererName,
  }).doc
  assert.deepEqual(
    repair.acceptanceItems.map((row) => row.name),
    expected.acceptanceItems.map((row) => row.name),
  )
  assert.deepEqual(
    repair.deliveryPhotos.map((row) => row.url),
    expected.deliveryPhotos.map((row) => row.url),
  )
})

test('旧册薄报告：用冻住的交车节点重生成一次', () => {
  const pkg = {
    flowVersion: 6,
    flowNodes: [
      {
        id: 'work_1',
        kind: 'work',
        status: 'completed',
        content: {
          findings: [{ partName: '右前门', caption: '补漆并更换饰条', brand: '原厂' }],
        },
      },
      {
        id: 'delivery_1',
        kind: 'delivery_photos',
        status: 'completed',
        content: {
          repairBrief: '右前门补漆完成，饰条已换新。',
          ownerFaqs: [{ id: 'faq_1', question: '几天可以洗车？', answer: '48 小时后再洗。' }],
          acceptanceItems: [
            { id: 'acc_1', name: '右前门', standard: '自然光下无明显色差', result: 'pass' },
          ],
          deliveryPhotos: [
            { url: 'https://cdn.example.com/finish-front.jpg' },
            { url: 'https://cdn.example.com/finish-side.jpg' },
          ],
          warrantyPeriod: '12 个月',
          warrantyNotes: '不含事故损伤',
          delivererName: '李店长',
        },
      },
      {
        id: 'repair_1',
        kind: 'repair_report',
        document: {
          docType: 'repair_report',
          status: 'pending_confirm',
          payload: { warrantyPeriod: '12 个月' },
        },
      },
    ],
  }
  const { pkg: next, changed } = healFinishReportPackage(pkg)
  assert.equal(changed, true)
  const report = next.flowNodes.find((row) => row.kind === 'repair_report')
  const body = contentOfFlowNode(report)
  assert.equal(body.repairBrief, '右前门补漆完成，饰条已换新。')
  assert.equal(body.warrantyPeriod, '12 个月')
  assert.ok(body.deliveryPhotos.length >= 1)
  assert.equal(body.ownerFaqs.length, 1)
  assert.equal(body.delivererName, '李店长')
})

test('车主接车报告：已发出但只留了留证时仍有入店照片', () => {
  const view = buildOwnerFlowView(
    albumWithFlow([
      {
        id: 'intake_1',
        kind: 'intake',
        title: '接车',
        status: 'completed',
        content: {
          chiefComplaint: '地面有油迹',
          pendingImages: [{ url: 'https://cdn.example.com/intake-front.jpg' }],
        },
        document: {
          docType: 'intake_confirm',
          status: 'delivered',
          payload: {},
        },
      },
    ]),
    [],
  )
  const intake = view.docs.find((row) => row && row.kind === 'intake')
  assert.ok(intake)
  assert.equal(intake.locked, false)
  assert.equal(intake.photos.length, 1)
  assert.match(intake.photos[0].url, /intake-front/)
})

test('接车报告：商家定稿预览与车主打开同一份图和诉求', () => {
  const { buildIntakePreviewFromContent } = require('../../../utils/owner-preview-doc')
  const content = {
    chiefComplaint: '过坎异响',
    photos: [{ url: 'https://cdn.example.com/intake-a.jpg' }],
    pendingImages: [{ url: 'https://cdn.example.com/intake-a.jpg' }],
    belongings: '雨伞',
    receiverName: '王师傅',
    receivedAt: '2026-11-03',
  }
  const album = albumWithFlow([])
  const merchant = buildIntakePreviewFromContent(content, album, {
    issued: true,
    mileageText: '里程 12,000 km',
  })
  const view = buildOwnerFlowView(
    albumWithFlow([
      {
        id: 'intake_1',
        kind: 'intake',
        status: 'completed',
        content,
        document: { docType: 'intake_confirm', status: 'delivered', payload: {} },
      },
    ]),
    [],
  )
  const owner = view.docs.find((row) => row && row.kind === 'intake')
  assert.ok(owner)
  assert.equal(owner.chiefComplaint, merchant.doc.chiefComplaint)
  assert.equal(owner.photos.length, merchant.doc.photos.length)
  assert.equal(owner.photos[0].url, merchant.doc.photos[0].url)
  assert.equal(owner.belongings, merchant.doc.belongings)
  assert.equal(owner.signName, merchant.doc.signName)
})

test('旧册已发出接车：heal 把留证收回定稿 photos', () => {
  const pkg = {
    flowVersion: 6,
    flowNodes: [
      {
        id: 'intake_1',
        kind: 'intake',
        status: 'completed',
        content: {
          pendingImages: [{ url: 'https://cdn.example.com/intake-heal.jpg' }],
        },
        document: { status: 'delivered', payload: {} },
      },
    ],
  }
  const { pkg: next, changed } = healFinishReportPackage(pkg)
  assert.equal(changed, true)
  const intake = next.flowNodes.find((row) => row.kind === 'intake')
  assert.equal(intake.content.photos.length, 1)
  assert.match(intake.content.photos[0].url, /intake-heal/)
})

test('旧册空接车节点：从接车报告找回照片', () => {
  const pkg = {
    flowVersion: 6,
    flowNodes: [
      {
        id: 'intake_1',
        kind: 'intake',
        status: 'completed',
        content: { pendingImages: [] },
        document: {
          status: 'delivered',
          payload: {
            photos: [
              { url: 'https://cdn.example.com/intake-front.jpg' },
              { url: 'https://cdn.example.com/intake-side.jpg' },
            ],
          },
        },
      },
    ],
  }
  const { pkg: next, changed } = healFinishReportPackage(pkg)
  assert.equal(changed, true)
  const intake = next.flowNodes.find((row) => row.kind === 'intake')
  assert.equal(intake.content.pendingImages.length, 2)
  assert.match(intake.content.pendingImages[0].url, /intake-front/)
})

test('旧册空节点：从已生成报告找回交车内容', () => {
  const pkg = {
    flowVersion: 6,
    flowNodes: [
      {
        id: 'delivery_1',
        kind: 'delivery_photos',
        status: 'completed',
        content: {},
      },
      {
        id: 'repair_1',
        kind: 'repair_report',
        document: {
          status: 'pending_confirm',
          payload: {
            repairBrief: '右前门补漆完成',
            warrantyPeriod: '12 个月',
            deliveryPhotos: [{ url: 'https://cdn.example.com/finish-front.jpg' }],
          },
        },
      },
    ],
  }
  const { pkg: next, changed } = healFinishReportPackage(pkg)
  assert.equal(changed, true)
  const delivery = next.flowNodes.find((row) => row.kind === 'delivery_photos')
  assert.equal(delivery.content.repairBrief, '右前门补漆完成')
  assert.equal(delivery.content.warrantyPeriod, '12 个月')
  assert.equal(delivery.content.deliveryPhotos[0].url, 'https://cdn.example.com/finish-front.jpg')
})

test('定稿后只丢简述问答：仍从交车报告收回', () => {
  const pkg = {
    flowVersion: 6,
    flowNodes: [
      {
        id: 'delivery_1',
        kind: 'delivery_photos',
        status: 'completed',
        content: {
          warrantyPeriod: '12 个月',
          deliveryPhotos: [{ url: 'https://cdn.example.com/finish-front.jpg' }],
          repairBrief: '',
          ownerFaqs: [],
        },
      },
      {
        id: 'repair_1',
        kind: 'repair_report',
        content: {
          repairBrief: '更换下摆臂并做了机油机滤',
          ownerFaqs: [{ id: 'faq_1', question: '几天可以洗车？', answer: '48 小时后再洗。' }],
          warrantyPeriod: '12 个月',
          deliveryPhotos: [{ url: 'https://cdn.example.com/finish-front.jpg' }],
        },
        document: { status: 'pending_confirm', payload: {} },
      },
    ],
  }
  const { pkg: next, changed } = healFinishReportPackage(pkg)
  assert.equal(changed, true)
  const delivery = next.flowNodes.find((row) => row.kind === 'delivery_photos')
  assert.equal(delivery.content.repairBrief, '更换下摆臂并做了机油机滤')
  assert.equal(delivery.content.ownerFaqs.length, 1)
  assert.equal(delivery.content.ownerFaqs[0].question, '几天可以洗车？')
  assert.equal(delivery.content.warrantyPeriod, '12 个月')
})

test('落库迁移不得把交车报告摊成编辑袋', () => {
  const payload = {
    repairBrief: '右前门补漆完成，饰条已换新。',
    ownerFaqs: [{ id: 'faq_1', question: '几天可以洗车？', answer: '48 小时后再洗。' }],
    acceptanceItems: [
      { id: 'acc_1', name: '右前门', standard: '自然光下无明显色差', method: '目视', result: 'pass' },
    ],
    deliveryPhotos: [
      { url: 'https://cdn.example.com/finish-front.jpg' },
      { url: 'https://cdn.example.com/finish-side.jpg' },
    ],
    workItems: [{ name: '右前门', note: '补漆并更换饰条', amount: 800 }],
    warrantyPeriod: '12 个月',
    warrantyNotes: '不含事故损伤',
    delivererName: '李店长',
    totalAmount: 800,
  }
  const migrated = migrateNodeToSingleContent({
    id: 'repair_1',
    kind: 'repair_report',
    status: 'in_progress',
    document: {
      docType: 'repair_report',
      status: 'pending_confirm',
      payload,
    },
  })
  const folded = contentOfFlowNode(migrated)
  assert.equal(folded.repairBrief, payload.repairBrief)
  assert.equal(folded.workItems.length, 1)
  assert.equal(folded.workItems[0].partName || folded.workItems[0].name, '右前门')
  assert.equal(migrated.document.payload && Object.keys(migrated.document.payload).length, 0)
  assert.ok(folded.deliveryPhotos.length >= 2)
  assert.equal(Number(folded.totalAmount), 800)

  const view = buildOwnerFlowView(
    albumWithFlow([
      migrated,
      {
        id: 'work_1',
        kind: 'work',
        status: 'completed',
        content: {
          findings: [
            {
              partName: '右前门',
              caption: '补漆并更换饰条',
              images: [{ url: 'https://cdn.example.com/work-door.jpg' }],
            },
          ],
        },
      },
    ]),
    [],
  )
  const repair = view.docs.find((row) => row && row.kind === 'repair_report')
  const work = view.docs.find((row) => row && row.kind === 'work')
  assert.equal(repair.acceptanceItems.length, 1)
  assert.equal(repair.acceptanceItems[0].name, '右前门')
  assert.equal(repair.workItems.length, 1)
  assert.equal(repair.deliveryPhotos.length, 2)
  assert.equal(work.items.length, 1)
  assert.equal(work.items[0].images.length, 1)
})

test('信封模式下车主确认：方案在节点 content，确认校验能读到（回归：请至少填写一行方案项目）', () => {
  // 真实序列：商家发送报价后 document.payload 被信封模式清空，方案只留在 content.lines
  const node = {
    id: 'quote_1',
    kind: 'quote_confirm',
    status: 'in_progress',
    content: {
      lines: [
        { name: '拆检', amount: 0 },
        { name: '刹车片更换', amount: 300 },
      ],
    },
    document: { docType: 'quote_confirm', status: 'pending_confirm', payload: {} },
  }
  const merged = mergeConfirmPayload(node, node.document, {})
  assert.equal(merged.lines.length, 2)
  assert.deepEqual(collectQuoteConfirmGaps(merged), [])

  // 确认动作不改方案内容：前端传来的空编辑行不得盖掉商家方案
  const mergedWithBlank = mergeConfirmPayload(node, node.document, { lines: [{ name: '', amount: '' }] })
  assert.equal(mergedWithBlank.lines.length, 2)
  assert.deepEqual(collectQuoteConfirmGaps(mergedWithBlank), [])
})

test('旧册薄报告治愈后再迁移，交车正文仍在', () => {
  const pkg = {
    flowVersion: 6,
    flowNodes: [
      {
        id: 'work_1',
        kind: 'work',
        status: 'completed',
        content: {
          findings: [{ partName: '右前门', caption: '补漆并更换饰条', brand: '原厂' }],
        },
      },
      {
        id: 'delivery_1',
        kind: 'delivery_photos',
        status: 'completed',
        content: {
          repairBrief: '右前门补漆完成，饰条已换新。',
          ownerFaqs: [{ id: 'faq_1', question: '几天可以洗车？', answer: '48 小时后再洗。' }],
          acceptanceItems: [
            { id: 'acc_1', name: '右前门', standard: '自然光下无明显色差', result: 'pass' },
          ],
          deliveryPhotos: [
            { url: 'https://cdn.example.com/finish-front.jpg' },
            { url: 'https://cdn.example.com/finish-side.jpg' },
          ],
          warrantyPeriod: '12 个月',
          warrantyNotes: '不含事故损伤',
          delivererName: '李店长',
        },
      },
      {
        id: 'repair_1',
        kind: 'repair_report',
        document: {
          docType: 'repair_report',
          status: 'pending_confirm',
          payload: { warrantyPeriod: '12 个月' },
        },
      },
    ],
  }
  const { pkg: next, changed } = migrateFlowPackageOnce(pkg)
  assert.equal(changed, true)
  const body = contentOfFlowNode(next.flowNodes.find((row) => row.kind === 'repair_report'))
  assert.equal(body.repairBrief, '右前门补漆完成，饰条已换新。')
  assert.ok(body.deliveryPhotos.length >= 1)
  assert.equal(body.workItems.length, 1)
  assert.equal(body.workItems[0].partName || body.workItems[0].name, '右前门')
  assert.equal(body.ownerFaqs.length, 1)
})
