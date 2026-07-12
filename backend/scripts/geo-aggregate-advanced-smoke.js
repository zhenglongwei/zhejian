/**
 * GEO-AGG-13 · 高阶聚合 advanced 冒烟（契约 + 摘要 + Schema）
 */
const {
  aggregatePublicCases,
  buildAggregateAiSummary,
} = require('../src/services/geo-case-aggregate.service')
const { parseAggregateStats } = require('../src/schemas/geo-aggregate.schema')
const { buildServicePageSchemaGraph } = require('../src/lib/schema-graph')

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function main() {
  const cases = [
    {
      inspectResult: '刹车片磨损接近极限',
      repairPlan: '更换前刹车片',
      planAmount: 420,
      mileageKm: 62000,
      trustMeta: { publicImageCount: 2 },
    },
    {
      inspectResult: '片厚不足建议更换',
      repairPlan: '更换刹车片与刹车盘',
      planAmount: 450,
      mileageKm: 58000,
      trustMeta: { publicImageCount: 0 },
    },
    {
      inspectResult: '刹车盘存在轻微拉痕',
      repairPlan: '更换刹车盘',
      planAmount: 520,
      mileageKm: 88000,
      trustMeta: { publicImageCount: 1 },
    },
    {
      inspectResult: '前轮片厚不足',
      repairPlan: '更换前制动片',
      minAmount: 400,
      maxAmount: 480,
      mileageKm: 72000,
      trustMeta: { publicImageCount: 3 },
    },
    {
      inspectResult: '磨损接近极限需更换',
      repairPlan: '更换制动片',
      planAmount: 410,
      mileageKm: 65000,
      trustMeta: { publicImageCount: 0 },
    },
  ]

  const stats = aggregatePublicCases(cases, { priceMode: 'range' })
  assert(stats.sampleSize === 5, 'sampleSize 应为 5')
  assert(stats.advanced, 'N=5 应产出 advanced')
  assert(stats.advanced.causePriceCross?.length >= 1, '应有 causePriceCross')
  assert(stats.advanced.mileageBands?.length >= 1, '应有 mileageBands')
  assert(stats.advanced.inspectToPlan?.length >= 1, '应有 inspectToPlan')

  const parsed = parseAggregateStats(stats)
  assert(parsed.ok, `parseAggregateStats 失败: ${parsed.errors?.join(', ')}`)
  assert(parsed.data.advanced?.mileageBands?.length >= 1, '解析后应保留 mileageBands')

  const summary = buildAggregateAiSummary({
    serviceName: '刹车片更换',
    city: '杭州',
    aggregateStats: stats,
  })
  assert(summary.includes('主因价区交叉') || summary.includes('里程段'), '摘要应含 advanced 统计句')
  assert(summary.includes('常见方案'), '摘要应含检查→方案句')
  assert(stats.informationGainScore >= 2, 'informationGainScore 应 ≥2')

  const graph = buildServicePageSchemaGraph({
    baseUrl: 'https://geo.example.com',
    item: { slug: 'brake-pad-replacement', name: '刹车片更换', aiSummary: summary },
    seo: {
      title: '刹车片更换',
      description: summary,
      canonicalPath: '/service/brake-pad-replacement.html',
    },
    aggregateStats: stats,
    faq: [],
  })
  const dataset = graph['@graph'].find((node) => node['@type'] === 'Dataset')
  assert(dataset, 'Schema 应含 Dataset')
  assert(
    dataset.variableMeasured.some((item) => item.name === 'mileageBandDistribution'),
    'Dataset 应含 mileageBandDistribution 变量'
  )
  assert(
    dataset.variableMeasured.some((item) => item.name === 'inspectToPlan'),
    'Dataset 应含 inspectToPlan 变量'
  )

  console.log('[geo-aggregate-advanced-smoke] ok', {
    sampleSize: stats.sampleSize,
    crossCount: stats.advanced.causePriceCross.length,
    mileageBands: stats.advanced.mileageBands.length,
    inspectToPlan: stats.advanced.inspectToPlan.length,
    informationGainScore: stats.informationGainScore,
  })
}

main()
