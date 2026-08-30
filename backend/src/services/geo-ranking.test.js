/**
 * 榜单口径回归测试
 *
 * 守的是「说出口的话必须和做过的事对得上」这一条底线。
 * 分数算错还能重算；榜单上那句「X 家门店一次都没被提到」说出去，
 * 门店转头自己去问一遍 AI 就能戳穿——赔的是公司信誉。
 *
 * 已经出过两次同类事故，两次都是「拿 A 的结果说成 B 的事」：
 *   第一次  搜索回执被判成对话型，算进了 AI 可见性
 *   第二次  空批次（0 条有效回执）按时间取成最新，覆盖率显示 0%
 * 所以这里的用例不是算法细节，是这两句话不许再被说错。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  pickMeasurementSlots,
  pickPrimary,
  isZeroMention,
} = require('./geo-ranking.service')

/** 造一条评分记录，字段对齐 Prisma 的 geo_check_score */
function score(overrides = {}) {
  return {
    runId: 'run',
    channel: 'BROWSER',
    score: 0,
    visibilityScore: null,
    foundationScore: null,
    measuredScope: 'none',
    coverageRate: 0,
    confidence: 0,
    validPlatforms: 0,
    plannedPlatforms: 18,
    computedAt: '2026-08-29T10:00:00Z',
    ...overrides,
  }
}

test('空批次不能盖掉真正测出东西的历史批次', () => {
  const slots = pickMeasurementSlots([
    // 后跑的这一轮整轮超时：0 条有效回执，分数 0
    score({ runId: 'empty_latest', computedAt: '2026-08-30T10:00:00Z', validPlatforms: 0, foundationScore: null }),
    // 前一天跑通的：18 个平台里 12 条有效，78 分
    score({ runId: 'good_yesterday', computedAt: '2026-08-29T10:00:00Z', validPlatforms: 12, foundationScore: 78, score: 78, measuredScope: 'foundation', confidence: 100 }),
  ])

  // 地基槽照常取到有用的那条
  assert.equal(slots.foundation.runId, 'good_yesterday')
  // browserLatest 也不能被空批次顶掉，否则前端覆盖率显示 0%，
  // 「一次都没被提到」这句话就从这儿冒出来
  assert.equal(slots.browserLatest.runId, 'good_yesterday')
  assert.equal(slots.browserLatest.coverageRate, 0) // 这条本身命中率确实是 0，但它是真实测出来的
})

test('多条可用批次时，browserLatest 取其中最新的一条', () => {
  const slots = pickMeasurementSlots([
    score({ runId: 'old', computedAt: '2026-08-28T10:00:00Z', validPlatforms: 10, foundationScore: 60 }),
    score({ runId: 'new', computedAt: '2026-08-30T10:00:00Z', validPlatforms: 11, foundationScore: 70 }),
    score({ runId: 'mid', computedAt: '2026-08-29T10:00:00Z', validPlatforms: 9, foundationScore: 80 }),
  ])
  // 注意：browserLatest 只看时间和有没有效，不看分数高低
  assert.equal(slots.browserLatest.runId, 'new')
  // 而地基槽按「测得全不全」挑，11 个有效平台那条胜出
  assert.equal(slots.foundation.runId, 'new')
})

test('全是空批次时退回最后一条，好让前端明说「未测得有效数据」', () => {
  const slots = pickMeasurementSlots([
    score({ runId: 'empty_1', computedAt: '2026-08-29T10:00:00Z' }),
    score({ runId: 'empty_2', computedAt: '2026-08-30T10:00:00Z' }),
  ])
  // 三槽全空是对的，但不能连最后一条也不给——
  // 前端要靠它显示「本轮未测得有效数据」，而不是静默消失
  assert.equal(slots.foundation, null)
  assert.equal(slots.visibility, null)
  assert.equal(slots.browserLatest.runId, 'empty_2')
})

test('接口联网通道只有一个名字，不按 measuredScope 再分地基/可见性', () => {
  // 曾经这里按 measuredScope 分出过「接口联网地基分」，
  // 可地基分是浏览器真机搜店名测出来的，接口调一次搜索 API 根本不是一回事
  for (const scope of ['foundation', 'visibility', 'both', 'none']) {
    const primary = pickPrimary({
      visibility: null,
      foundation: null,
      api: score({ runId: 'api', channel: 'API', score: 78, measuredScope: scope, confidence: 100, validPlatforms: 5 }),
    })
    assert.equal(primary.scoreLabel, '接口联网分', `measuredScope=${scope} 时不该换个叫法`)
    assert.equal(primary.scoreType, 'api_network')
  }
})

test('可见性测得 0 分才算「一次都没被提到」', () => {
  assert.equal(isZeroMention({ visibilityMeasured: true, visibilityScore: 0 }), true)
  assert.equal(isZeroMention({ visibilityMeasured: true, visibilityScore: 45 }), false)
  // 未测就是未测，绝不能因为覆盖率是 0 就算成「没被提到」
  assert.equal(isZeroMention({ visibilityMeasured: false, visibilityScore: null }), false)
  assert.equal(isZeroMention({ visibilityMeasured: true, visibilityScore: null }), false)
  assert.equal(isZeroMention(null), false)
})

test('三条分数各归各的槽，互不挤掉', () => {
  const slots = pickMeasurementSlots([
    // 只跑通了可见性的一轮
    score({ runId: 'vis_run', computedAt: '2026-08-30T10:00:00Z', validPlatforms: 2, visibilityScore: 40, confidence: 100 }),
    // 只跑通了地基的一轮（必应抽风，置信度只有 67）
    score({ runId: 'found_run', computedAt: '2026-08-30T11:00:00Z', validPlatforms: 2, foundationScore: 79, confidence: 67 }),
  ])
  assert.equal(slots.visibility.runId, 'vis_run')
  assert.equal(slots.foundation.runId, 'found_run')
  // 两条都在榜单上留着，凭什么互相挤掉
  assert.equal(slots.visibility.visibilityScore, 40)
  assert.equal(slots.foundation.foundationScore, 79)
})
