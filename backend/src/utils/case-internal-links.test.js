/**
 * 案例页「相关专题」必须进 /topic/，不得落到商品页 /service/
 */
const assert = require('assert')
const { buildCaseInternalLinks } = require('./case-internal-links')

function run() {
  const links = buildCaseInternalLinks({
    id: 'c1',
    serviceName: '钣喷修复',
    city: '杭州',
    storeId: 's1',
    storeName: '示范店',
  })
  assert.ok(links.geoTopic, '应返回相关专题')
  assert.strictEqual(links.geoTopic.path, '/topic/body-paint-repair')
  assert.ok(!String(links.geoTopic.path).includes('/service/'))
  const geoEntry = (links.links || []).find((row) => row.type === 'geo')
  assert.ok(geoEntry)
  assert.strictEqual(geoEntry.path, '/topic/body-paint-repair')
  console.log('[case-internal-links.test] ok')
}

run()
