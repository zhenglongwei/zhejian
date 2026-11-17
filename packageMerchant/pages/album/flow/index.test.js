const test = require('node:test')
const assert = require('node:assert/strict')

let pageDefinition
global.Page = (definition) => {
  pageDefinition = definition
}
global.wx = {
  getStorageSync: () => '',
  showToast: () => {},
}
require('./index')

function context(nodes, activeNode) {
  return Object.assign(Object.create(pageDefinition), {
    albumId: 'album-test',
    _album: {
      serviceName: '测试维修',
      vehicle: { plate: '粤B12345', mileage: 40000 },
    },
    _flowNodes: nodes,
    data: {
      activeNode,
      activeKind: (activeNode && activeNode.kind) || '',
      quoteLines: [{ name: '当前编辑报价', amount: 999 }],
      workerName: '当前施工人',
      workFinishedAt: '2026-11-17 12:00',
    },
    setData(patch) {
      this.data = { ...this.data, ...patch }
    },
    collectFindingsFromSections() {
      return [{ partName: '当前编辑施工' }]
    },
  })
}

test('报价预览按 nodeId 读取首次与历次补充，不混入当前编辑节点或首报快照', () => {
  const nodes = [
    {
      id: 'q0',
      kind: 'quote_confirm',
      sortOrder: 1,
      content: { lines: [{ name: '首次报价项目', amount: 400 }] },
      document: { status: 'confirmed' },
      renderDoc: {
        family: 'quote',
        doc: { title: '报价单', lines: [{ name: '首次报价快照', amount: 400 }] },
        quoteLines: [],
        hasBody: true,
      },
    },
    {
      id: 'q1',
      kind: 'quote_confirm',
      sortOrder: 2,
      insertedReason: 'addon',
      content: { lines: [{ name: '第一次补充项目', amount: 100 }] },
      document: { status: 'confirmed' },
    },
    {
      id: 'q2',
      kind: 'addon_quote_confirm',
      sortOrder: 3,
      insertedReason: 'addon',
      content: { lines: [{ name: '第二次补充项目', amount: 400 }] },
      document: { status: 'confirmed' },
    },
  ]
  const page = context(nodes, nodes[1])
  const first = page.reportPreviewFor('报价单', { issuedOnly: true, nodeId: 'q0' })
  assert.equal(first.doc.title, '报价单')
  assert.equal(first.doc.lines[0].name, '首次报价快照')

  const addon1 = page.reportPreviewFor('补充报价单', { issuedOnly: true, nodeId: 'q1' })
  assert.equal(addon1.doc.title, '补充报价')
  assert.equal(addon1.doc.lines[0].name, '第一次补充项目')
  assert.equal(addon1.doc.totalAmountLabel, '合计 ¥100.00')

  const activeAddon = page.reportPreviewFor('报价单', { issuedOnly: true })
  assert.equal(activeAddon.doc.lines[0].name, '第一次补充项目')
  const editingAddon = page.reportPreviewFor('报价单')
  assert.equal(editingAddon.doc.lines[0].name, '当前编辑报价')

  page.onOpenDoc({ currentTarget: { dataset: { id: 'q2', title: '补充报价单' } } })
  assert.equal(page.data.docBrief.nodeId, 'q2')
  assert.equal(page.data.docBrief.lines[0].name, '第二次补充项目')
  assert.equal(page.data.docBrief.sheetDoc.lines[0].name, '第二次补充项目')
  assert.equal(page.data.docBrief.sheetDoc.totalAmountLabel, '合计 ¥400.00')
})

test('施工预览按 nodeId 区分首次、补充与返工施工', () => {
  const nodes = [
    {
      id: 'w0',
      kind: 'work',
      sortOrder: 1,
      content: { findings: [{ partName: '首次施工项目', caption: '首次施工说明' }] },
    },
    {
      id: 'w1',
      kind: 'work',
      sortOrder: 2,
      insertedReason: 'addon',
      content: { findings: [{ partName: '补充施工项目', caption: '补充施工说明' }] },
    },
    {
      id: 'w2',
      kind: 'work',
      sortOrder: 3,
      insertedReason: 'rework',
      content: { findings: [{ partName: '返工施工项目', caption: '返工施工说明' }] },
    },
  ]
  const page = context(nodes, nodes[1])
  const first = page.reportPreviewFor('维修工单', { issuedOnly: true, nodeId: 'w0' })
  assert.equal(first.doc.title, '维修工单')
  assert.equal(first.doc.items[0].name, '首次施工项目')

  const addon = page.reportPreviewFor('补充施工', { issuedOnly: true, nodeId: 'w1' })
  assert.equal(addon.doc.title, '补充施工')
  assert.equal(addon.doc.items[0].name, '补充施工项目')

  const editingAddon = page.reportPreviewFor('维修工单')
  assert.equal(editingAddon.doc.items[0].name, '当前编辑施工')

  const rework = page.reportPreviewFor('补充施工', { issuedOnly: true, nodeId: 'w2' })
  assert.equal(rework.doc.items[0].name, '返工施工项目')

  page.onOpenDoc({ currentTarget: { dataset: { id: 'w1', title: '补充施工' } } })
  assert.equal(page.data.docBrief.nodeId, 'w1')
  assert.equal(page.data.docBrief.lines[0].name, '补充施工项目')
  assert.equal(page.data.docBrief.sheetDoc.items[0].name, '补充施工项目')
})
