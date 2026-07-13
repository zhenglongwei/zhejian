/**
 * GEO-TOPIC-E08 · 车型轻量专题链路冒烟
 */
require('dotenv').config()
const assert = require('assert')
const { prisma } = require('../src/lib/prisma')
const { GEO_PAGE_STATUS } = require('../src/constants/geo-page-status')
const {
  discoverVehicleSeriesTopicSeeds,
  validateVehicleTopicPublishGate,
  buildVehicleTopicPromptSeed,
  MIN_VEHICLE_TOPIC_SAMPLE,
} = require('../src/services/geo-vehicle-topic.service')
const { generateVehicleSeriesDrafts } = require('../src/services/geo-page-generator.service')

const MOCK_CASES = [
  {
    id: 'vc1',
    vehicleText: '宝马 3系',
    serviceName: '刹车片更换',
    serviceItemId: 'item_brake_pad',
    planAmount: 420,
    seoNoindex: false,
  },
  {
    id: 'vc2',
    vehicleText: '宝马3系',
    serviceName: '刹车片更换',
    serviceItemId: 'item_brake_pad',
    planAmount: 500,
    seoNoindex: false,
  },
  {
    id: 'vc3',
    vehicleText: '宝马3系',
    serviceName: '刹车片更换',
    serviceItemId: 'item_brake_pad',
    planAmount: 480,
    seoNoindex: false,
  },
]

async function main() {
  const seeds = discoverVehicleSeriesTopicSeeds(MOCK_CASES, { minSample: MIN_VEHICLE_TOPIC_SAMPLE })
  assert.ok(seeds.length >= 1, '应发现车型选题 seed')
  assert.ok(seeds[0].promptId, 'seed 应含 promptId')
  assert.strictEqual(seeds[0].promptType, 'C')

  const drafts = generateVehicleSeriesDrafts(MOCK_CASES, { minSample: MIN_VEHICLE_TOPIC_SAMPLE })
  const draft = drafts.find((item) => item.slug === seeds[0].slug)
  assert.ok(draft, '应生成车型专题草稿')
  assert.ok(draft.vehicleSeries, '草稿应含车系')
  assert.ok(draft.aiSummary.includes('例脱敏案例'), '草稿摘要应含案例统计')

  const gate = validateVehicleTopicPublishGate(
    {
      slug: draft.slug,
      vehicleSeries: draft.vehicleSeries,
      serviceId: draft.serviceId,
      relatedServiceId: draft.relatedServiceId,
      relatedCaseIds: draft.relatedCaseIds,
      aiSummary: draft.aiSummary,
      faq: draft.faq,
    },
    MOCK_CASES
  )
  assert.strictEqual(gate.passed, true)

  let blocked = false
  try {
    validateVehicleTopicPublishGate(
      { slug: 'x', vehicleSeries: '宝马3系', serviceId: 'item_brake_pad', relatedCaseIds: [], aiSummary: '', faq: [] },
      []
    )
  } catch (error) {
    blocked = true
  }
  assert.strictEqual(blocked, true, '样本不足应拦截发布')

  const prompt = buildVehicleTopicPromptSeed({
    slug: draft.slug,
    vehicleSeries: draft.vehicleSeries,
    serviceMeta: { displayName: '刹车片更换' },
  })
  assert.ok(prompt.promptId.startsWith('prompt_vehicle_'))

  const publishedVehicleCount = await prisma.geoPage.count({
    where: { pageType: 'vehicle_service', status: GEO_PAGE_STATUS.PUBLISHED },
  })

  console.log('[geo-vehicle-topic-smoke] ok', {
    seedCount: seeds.length,
    draftSlug: draft.slug,
    publishedVehicleTopics: publishedVehicleCount,
    promptId: prompt.promptId,
  })
}

main()
  .catch((error) => {
    console.error('[geo-vehicle-topic-smoke] ❌', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
