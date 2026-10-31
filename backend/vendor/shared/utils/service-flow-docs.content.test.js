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
assert.equal(migrated.document.payload.conclusion, '需测厚')

assert.equal(contentOfFlowNode(migrated).conclusion, '需测厚')
assert.equal(contentOfFlowNode({ photoDraft: { conclusion: '旧' } }).conclusion, '旧')

const merged = mergeNodeContent(migrated.content, { inspectorName: '张师傅' })
assert.equal(merged.inspectorName, '张师傅')
assert.equal(merged.conclusion, '需测厚')

console.log('service-flow-docs.content.test.js OK')
