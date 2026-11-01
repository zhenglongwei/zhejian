const test = require('node:test')
const assert = require('node:assert/strict')
const { buildOwnerFlowView, healFinishReportPackage, migrateFlowPackageOnce } = require('./service-flow.service')
const { migrateNodeToSingleContent, contentOfFlowNode } = require('../../../utils/service-flow-docs')
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
  assert.equal(repair.repairBrief, '右前门补漆完成，饰条已换新。')
  assert.equal(repair.workItems.length, 1)
  assert.equal(repair.workItems[0].name, '右前门')
  assert.equal(Number(repair.workItems[0].amount), 800)
  assert.equal(repair.deliveryPhotos.length, 2)
  assert.equal(repair.ownerFaqs.length, 1)
  assert.equal(repair.warrantyNotes, '不含事故损伤')
  assert.equal(repair.signName, '李店长')

  const expected = buildOwnerPreviewDoc({
    family: 'finish',
    album: previewAlbumOf(albumWithFlow([])),
    workItems: payload.workItems,
    totalAmount: 800,
    deliveryPhotos: payload.deliveryPhotos,
    repairBrief: payload.repairBrief,
    ownerFaqs: payload.ownerFaqs,
    warrantyPeriod: payload.warrantyPeriod,
    warrantyNotes: payload.warrantyNotes,
    signName: payload.delivererName,
  }).doc
  assert.equal(repair.repairBrief, expected.repairBrief)
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
          deliveryExteriorUrl: 'https://cdn.example.com/finish-front.jpg',
          selectedDeliveryUrls: ['https://cdn.example.com/finish-side.jpg'],
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
  assert.equal(delivery.content.deliveryExteriorUrl, 'https://cdn.example.com/finish-front.jpg')
})

test('落库迁移不得把交车报告摊成编辑袋', () => {
  const payload = {
    repairBrief: '右前门补漆完成，饰条已换新。',
    ownerFaqs: [{ id: 'faq_1', question: '几天可以洗车？', answer: '48 小时后再洗。' }],
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
  assert.equal(repair.repairBrief, payload.repairBrief)
  assert.equal(repair.workItems.length, 1)
  assert.equal(repair.deliveryPhotos.length, 2)
  assert.equal(work.items.length, 1)
  assert.equal(work.items[0].images.length, 1)
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
          deliveryExteriorUrl: 'https://cdn.example.com/finish-front.jpg',
          selectedDeliveryUrls: ['https://cdn.example.com/finish-side.jpg'],
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
