/**
 * 评分口径回归测试
 *
 * 这里守的不是算法细节，是三条不能破的纪律：
 *   1. 搜索引擎的回执不许被算成「AI 可见性」
 *   2. 没测到的项目必须是 null，不许是 0
 *   3. 只测了一块的时候，标签必须写明测的是哪一块
 *
 * 第 1 条出过一次事故：scoreOf 内部按 platformTypes[id] || 'chat' 判类型，
 * 而 analyzeRun 里那套「baidu_web 这种 id 一律算搜索引擎」的兜底规则没传进去。
 * 结果 8-29 下午那批只有搜索引擎回执的老批次，全被记成了 AI 可见性 0 分，
 * 榜单对外宣称「13 家门店一次都没被提到」——我们压根没问过大模型。
 * 分数错了还能重算，这种话说出去是要赔信誉的。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  scoreOf,
  analyzeRun,
  nameVariants,
  platformTypeOf,
} = require('./geo-check-analyze.service')

/** 造一条回执，字段对齐 analyzeAnswer 的输出 */
function receipt(overrides = {}) {
  return {
    id: 'a1',
    platform: 'baidu_web',
    platformLabel: '百度网页',
    status: 'ok',
    valid: true,
    mentioned: true,
    firstRank: 1,
    ecosystems: [],
    citedUrls: [],
    rowsByType: {},
    hitHosts: [],
    ...overrides,
  }
}

test('scoreOf 认得带 _web 的平台 id（不靠调用方传 platformTypes）', () => {
  const result = scoreOf([receipt({ platform: 'baidu_web' })], { variants: nameVariants('杭州某某汽车维修') })
  // 关键：搜索型回执必须走地基块，可见性块保持未测
  assert.equal(result.measuredScope, 'foundation')
  assert.equal(result.visibilityScore, null)
  assert.notEqual(result.foundationScore, null)
})

test('scoreOf 认得 search 结尾的平台 id', () => {
  const result = scoreOf([receipt({ platform: 'baidu_search' })], {})
  assert.equal(result.measuredScope, 'foundation')
  assert.equal(result.visibilityScore, null)
})

test('scoreOf 把不带 _web/search 的平台当对话型', () => {
  const result = scoreOf([receipt({ platform: 'qwen', firstRank: null })], {})
  assert.equal(result.measuredScope, 'visibility')
  assert.equal(result.foundationScore, null)
  assert.notEqual(result.visibilityScore, null)
})

test('只测了一块时，另一块必须是 null，不能是 0', () => {
  const onlyFoundation = scoreOf([receipt({ platform: 'baidu_web' })], {})
  assert.equal(onlyFoundation.visibilityScore, null)

  const onlyVisibility = scoreOf([receipt({ platform: 'doubao', firstRank: null })], {})
  assert.equal(onlyVisibility.foundationScore, null)
})

test('抓失败的回执不计入分母，也不算「没被提到」', () => {
  const result = scoreOf(
    [
      receipt({ id: 'a1', platform: 'doubao', status: 'error', valid: false, mentioned: null, firstRank: null }),
      receipt({ id: 'a2', platform: 'qwen', mentioned: true, firstRank: null }),
    ],
    {},
  )
  // 一条有效、被提到 → 覆盖率应该是 100%，不是 50%
  assert.equal(result.coverageRate, 100)
  assert.equal(result.validPlatforms, 1)
})

test('platformTypeOf 是唯一判官：老批次没声明类型也要判对', () => {
  // 这里必须调真函数，不许把正则抄一份过来断言——
  // 抄一份的测试只会守住「副本和副本一致」，真规则改了它照样绿。
  assert.equal(platformTypeOf('baidu_web'), 'search')
  assert.equal(platformTypeOf('so_web'), 'search')
  assert.equal(platformTypeOf('bing_web'), 'search')
  assert.equal(platformTypeOf('baidu_search'), 'search')
  assert.equal(platformTypeOf('qwen'), 'chat')
  assert.equal(platformTypeOf('doubao'), 'chat')
  assert.equal(platformTypeOf('yuanbao'), 'chat')
  assert.equal(platformTypeOf('hunyuan'), 'chat')
})

test('配置里显式声明的类型优先于 id 推测', () => {
  // 万一以后冒出一个 id 叫 xxx_search 但其实是问答平台，配置要能盖过去
  assert.equal(platformTypeOf('baidu_search', { baidu_search: 'chat' }), 'chat')
  assert.equal(platformTypeOf('qwen', { qwen: 'search' }), 'search')
  // 声明成乱七八糟的值时退回推测，别静默变成第三种类型
  assert.equal(platformTypeOf('baidu_web', { baidu_web: 'SEARCH' }), 'search')
  assert.equal(platformTypeOf('baidu_web', { baidu_web: 'unknown' }), 'search')
  assert.equal(platformTypeOf('qwen', { qwen: 'nonsense' }), 'chat')
})

test('analyzeRun 对老批次（configJson 没有 platformTypes）也要判对类型', async () => {
  // 老批次 configJson 里没有 platformTypes，scoreOf 拿到的 map 是空的。
  // 只要规则统一在 platformTypeOf 里，空 map 和补全过的 map 结果必须一致。
  const ids = ['baidu_web', 'so_web']
  const resolved = Object.fromEntries(ids.map((id) => [id, platformTypeOf(id)]))

  const bare = scoreOf(
    [receipt({ platform: 'baidu_web' }), receipt({ id: 'a2', platform: 'so_web' })],
    {},
  )
  const filled = scoreOf(
    [receipt({ platform: 'baidu_web' }), receipt({ id: 'a2', platform: 'so_web' })],
    { platformTypes: resolved },
  )

  for (const result of [bare, filled]) {
    assert.equal(result.measuredScope, 'foundation')
    assert.equal(result.visibilityScore, null)
    assert.notEqual(result.foundationScore, null)
  }
  // 补全前后分数必须一模一样，否则说明还有第二把尺子
  assert.equal(bare.foundationScore, filled.foundationScore)
})

test('analyzeRun 是导出的函数（改名或删掉会立刻被这个测试拦下）', () => {
  assert.equal(typeof analyzeRun, 'function')
})
