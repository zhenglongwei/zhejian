const test = require('node:test')
const assert = require('node:assert/strict')
const { buildFinishReportLinks } = require('./owner-preview-doc')

test('交车报告入口：按流程顺序映射标题，补充单据单独命名', () => {
  const links = buildFinishReportLinks([
    { id: 'n1', kind: 'intake' },
    { id: 'n2', kind: 'inspection_report' },
    { id: 'n3', kind: 'quote_confirm' },
    { id: 'n4', kind: 'addon_quote_confirm' },
    { id: 'n5', kind: 'work' },
    { id: 'n6', kind: 'work', insertedReason: 'addon' },
    { id: 'n7', kind: 'delivery_photos' },
    { id: 'n8', kind: 'repair_report' },
  ])
  assert.deepEqual(links, [
    { nodeId: 'n1', kind: 'intake', title: '接车报告' },
    { nodeId: 'n2', kind: 'inspection_report', title: '检测报告' },
    { nodeId: 'n3', kind: 'quote_confirm', title: '报价单' },
    { nodeId: 'n4', kind: 'addon_quote_confirm', title: '补充报价单' },
    { nodeId: 'n5', kind: 'work', title: '维修工单' },
    { nodeId: 'n6', kind: 'work', title: '补充施工' },
  ])
})

test('交车报告入口：跳过锁定、取消与重复单据', () => {
  const links = buildFinishReportLinks([
    { id: 'n1', kind: 'intake', locked: true },
    { id: 'n2', kind: 'quote_confirm', cancelled: true },
    { id: 'n3', kind: 'work', document: { status: 'cancelled' } },
    { id: 'n4', kind: 'work', status: 'locked' },
    { id: 'n5', kind: 'inspection_report' },
    { id: 'n5', kind: 'inspection_report' },
  ])
  assert.deepEqual(links, [{ nodeId: 'n5', kind: 'inspection_report', title: '检测报告' }])
})
