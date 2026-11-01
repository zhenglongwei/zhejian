/**
 * 运行：node vendor/shared/utils/service-flow-docs.content.test.js
 */
const assert = require('assert')
const {
  contentOfFlowNode,
  migrateNodeToSingleContent,
  mergeNodeContent,
} = require('./service-flow-docs')

const old = {
  id: 'n1',
  kind: 'inspection',
  photoDraft: {
    findings: [{ id: 'a', partName: '制动盘', images: [{ url: 'https://x/a.jpg' }] }],
    conclusion: '需测厚',
  },
  document: {
    docType: 'inspection_report',
    status: 'draft',
    payload: { chiefComplaint: '异响' },
  },
}

const migrated = migrateNodeToSingleContent(old)
assert.ok(migrated.content)
assert.equal(migrated.photoDraft, undefined)
assert.equal(migrated.content.conclusion, '需测厚')
assert.equal(migrated.content.chiefComplaint, '异响')
assert.equal(migrated.content.findings[0].partName, '制动盘')
assert.equal(migrated.document.status, 'draft')
assert.deepEqual(migrated.document.payload, {})

assert.equal(contentOfFlowNode(migrated).conclusion, '需测厚')
assert.equal(contentOfFlowNode({ photoDraft: { conclusion: '旧' } }).conclusion, '旧')

const merged = mergeNodeContent(migrated.content, { inspectorName: '张师傅' })
assert.equal(merged.inspectorName, '张师傅')
assert.equal(merged.conclusion, '需测厚')

const repair = migrateNodeToSingleContent({
  id: 'r1',
  kind: 'repair_report',
  document: {
    status: 'pending_confirm',
    payload: {
      repairBrief: '补漆完成',
      workItems: [{ name: '右前门', note: '补漆', amount: 800 }],
      deliveryPhotos: [{ url: 'https://x/finish.jpg' }],
      totalAmount: 800,
    },
  },
})
const repairBody = contentOfFlowNode(repair)
assert.equal(repairBody.repairBrief, '补漆完成')
assert.equal(repairBody.workItems[0].partName || repairBody.workItems[0].name, '右前门')
assert.equal(repairBody.deliveryPhotos.length, 1)
assert.equal(Number(repairBody.totalAmount), 800)
assert.deepEqual(repair.document.payload, {})

console.log('service-flow-docs.content.test.js OK')
