/**
 * node src/utils/case-slug.test.js
 */
const assert = require('assert')
const {
  buildCaseSlug,
  buildCasePagePath,
  resolveCaseCanonicalPath,
  isH5RoutableCaseSlug,
  resolveRoutableCaseSlug,
} = require('./case-slug')

assert.strictEqual(isH5RoutableCaseSlug('hangzhou-bmw-3series-repair-case_abc'), true)
assert.strictEqual(isH5RoutableCaseSlug('index'), false)
assert.strictEqual(isH5RoutableCaseSlug('view'), false)
assert.strictEqual(
  isH5RoutableCaseSlug('杭州盈简科技有限公司｜宝马 3系｜底盘维修过程记录'),
  false
)
assert.strictEqual(isH5RoutableCaseSlug(''), false)

const asciiSlug = buildCaseSlug({
  city: '杭州',
  vehicle: { brand: '宝马', series: '3系' },
  serviceName: '底盘维修',
  caseId: 'case_svc_mrvw2nuh_aaa607',
})
assert.ok(isH5RoutableCaseSlug(asciiSlug), `expected routable slug, got ${asciiSlug}`)
assert.ok(asciiSlug.includes('hangzhou'))
assert.ok(asciiSlug.includes('bmw'))
assert.ok(asciiSlug.includes('case-svc-mrvw2nuh-aaa607') || asciiSlug.includes('aaa607'))

assert.strictEqual(buildCasePagePath(asciiSlug), `/case/${asciiSlug}.html`)
assert.strictEqual(buildCasePagePath('杭州案例标题'), '')
assert.strictEqual(
  resolveCaseCanonicalPath({ slug: '杭州案例标题', caseId: 'case_1' }),
  '/case/view.html?id=case_1'
)
assert.strictEqual(
  resolveCaseCanonicalPath({ slug: asciiSlug, caseId: 'case_1' }),
  `/case/${asciiSlug}.html`
)

async function testResolveRoutable() {
  const prisma = {
    publicCase: {
      findUnique: async () => null,
    },
  }
  const kept = await resolveRoutableCaseSlug(prisma, {
    existingSlug: 'hangzhou-ok-case_1',
    caseId: 'case_1',
  })
  assert.strictEqual(kept, 'hangzhou-ok-case_1')

  const rebuilt = await resolveRoutableCaseSlug(prisma, {
    existingSlug: '杭州盈简｜底盘维修过程记录',
    city: '杭州',
    vehicle: { brand: '宝马', series: '3系' },
    serviceName: '底盘维修',
    caseId: 'case_svc_mrvw2nuh_aaa607',
  })
  assert.ok(isH5RoutableCaseSlug(rebuilt), `rebuilt must be routable: ${rebuilt}`)
  assert.notStrictEqual(rebuilt, '杭州盈简｜底盘维修过程记录')
}

testResolveRoutable()
  .then(() => {
    console.log('case-slug.test.js OK')
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
