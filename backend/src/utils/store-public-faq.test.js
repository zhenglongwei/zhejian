/**
 * 门店差异化 FAQ / 案例预览单测
 */
const assert = require('assert')
const { buildStorePublicFaq } = require('./store-public-faq')
const { mapStoreCasePreview } = require('./store-case-preview')

function run() {
  const empty = buildStorePublicFaq({
    storeName: '空壳店',
    address: '杭州市西湖区测试路1号',
    businessHours: '09:00-18:00',
    caseCount: 0,
  })
  assert.ok(empty.faq.length >= 2)
  assert.ok(empty.faq.some((item) => item.q.includes('营业时间')))
  assert.ok(!empty.faq.some((item) => item.q.includes('公开维修案例')))
  assert.strictEqual(empty.faqSource, 'derived')

  const withCases = buildStorePublicFaq({
    storeName: '循迹店',
    specialties: ['钣喷修复', '刹车系统'],
    vehicleSpecialties: ['大众', '丰田'],
    casePreviews: [{ title: '大众 · 刹车片更换' }],
    caseCount: 1,
    serviceNames: ['小保养'],
    phone: '0571-0000000',
  })
  assert.ok(withCases.faq.some((item) => item.q.includes('公开维修案例')))
  assert.ok(withCases.faq.some((item) => item.a.includes('大众 · 刹车片更换')))
  assert.ok(withCases.faq.some((item) => item.q.includes('擅长哪些车型')))

  const withCapability = buildStorePublicFaq({
    storeName: '能力店',
    specialties: ['四轮定位'],
    specialtyBrands: ['宝马', '奥迪'],
    equipmentTags: [{ label: '四轮定位' }, { label: '举升机' }],
    notAccepting: ['大型货车'],
  })
  assert.ok(withCapability.faq.some((item) => /宝马|设备|四轮定位/.test(item.q + item.a)))
  assert.ok(withCapability.faq.some((item) => item.a.includes('暂不承接') || item.q.includes('暂不承接')))

  const { buildCapabilitySummaryLine } = require('./store-public-faq')
  const summary = buildCapabilitySummaryLine({
    specialtyBrands: ['宝马'],
    equipmentTags: ['烤漆房'],
    notAccepting: [],
  })
  assert.ok(summary.includes('公开能力资料'))
  assert.ok(summary.includes('宝马'))

  const custom = buildStorePublicFaq({
    storeName: '定制店',
    customFaq: [{ q: '是否接待事故车？', a: '接待，需预约到店查勘。' }],
    specialties: ['钣喷修复'],
  })
  assert.strictEqual(custom.faq[0].q, '是否接待事故车？')
  assert.ok(custom.faqSource === 'mixed' || custom.faqSource === 'merchant')

  const preview = mapStoreCasePreview({
    id: 'c1',
    title: '旧标题',
    serviceName: '刹车片更换',
    contentJson: {
      vehicleText: '大众朗逸（已脱敏）',
      geo: { slug: 'hz-brakes-1', faultDesc: '制动异响' },
      snapshot: {
        version: 1,
        publicView: {
          version: 1,
          facts: { faultDesc: '制动异响' },
        },
      },
    },
  })
  assert.ok(preview.title.includes('大众朗逸'))
  assert.ok(preview.title.includes('刹车片更换'))
  assert.ok(!preview.title.includes('已脱敏'))
  assert.strictEqual(preview.path, '/case/hz-brakes-1.html')

  console.log('[store-public-faq.test] ok')
}

run()
