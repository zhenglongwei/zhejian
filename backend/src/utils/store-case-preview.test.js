const assert = require('assert')
const { mapStoreCasePreview } = require('./store-case-preview')

const fromRow = mapStoreCasePreview({
  id: 'case_1',
  title: '保养',
  serviceName: '小保养',
  slug: 'hangzhou-weixiu-case_1',
  contentJson: {},
})
assert.strictEqual(fromRow.path, '/case/hangzhou-weixiu-case_1.html')

const fromId = mapStoreCasePreview({
  id: 'case_2',
  title: '刹车',
  serviceName: '刹车片更换',
  contentJson: {},
})
assert.strictEqual(fromId.path, '/case/view.html?id=case_2')

console.log('store-case-preview.test.js OK')
