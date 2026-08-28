const test = require('node:test')
const assert = require('node:assert/strict')
const {
  classifySearchHit,
  classifyHost,
  textMentionsName,
  likelyOfficialHits,
  groupHitsBySource,
} = require('./geo-check-classify')
const { collectRawHits } = require('../services/geo-check-baidu-search.service')
const { extractJsonObject } = require('../services/geo-check-screenshot.service')
const { consumeDailyLimit } = require('../services/geo-check-rate-limit')
const { inferMapFromWebHits } = require('../services/geo-check-map.service')

test('classifyHost tags weixin before generic qq.com', () => {
  assert.equal(classifyHost('mp.weixin.qq.com').id, 'weixin')
  assert.equal(classifyHost('channels.weixin.qq.com').id, 'weixin')
  assert.equal(classifyHost('news.qq.com').id, 'media')
  assert.equal(classifyHost('zhuanlan.zhihu.com').id, 'zhihu')
  assert.equal(classifyHost('www.sohu.com').id, 'sohu')
  assert.equal(classifyHost('baike.baidu.com').id, 'baike')
  assert.equal(classifyHost('simplewin.cn').id, 'web')
})

test('textMentionsName matches short company name', () => {
  assert.equal(textMentionsName('杭州盈简科技有限公司主营数字资产', '盈简科技', '杭州'), true)
  assert.equal(textMentionsName('附近推荐另一家店', '盈简科技', '杭州'), false)
})

test('likelyOfficialHits skips zhihu', () => {
  const hits = [
    classifySearchHit({ url: 'https://zhuanlan.zhihu.com/p/1', title: '盈简科技怎么样' }),
    classifySearchHit({ url: 'https://simplewin.cn/', title: '杭州盈简科技有限公司' }),
  ]
  const official = likelyOfficialHits(hits, '盈简科技')
  assert.equal(official.length, 1)
  assert.equal(official[0].host, 'simplewin.cn')
})

test('groupHitsBySource buckets', () => {
  const hits = [
    classifySearchHit({ url: 'https://www.sohu.com/a/1', title: 'a' }),
    classifySearchHit({ url: 'https://www.zhihu.com/question/1', title: 'b' }),
  ]
  const groups = groupHitsBySource(hits)
  assert.equal(groups.length, 2)
})

test('collectRawHits reads official references array', () => {
  const raw = collectRawHits({
    request_id: 'abc',
    references: [
      {
        id: 1,
        title: '河北天气',
        url: 'https://www.weather.com.cn/html/weather/101031600.shtml',
        content: '河北天气预报…',
        type: 'web',
      },
    ],
  })
  assert.equal(raw.length, 1)
  assert.equal(raw[0].title, '河北天气')
  assert.match(raw[0].snippet, /河北/)
})

test('baiduQueryUnits caps at 72 with CJK as 2', () => {
  const { baiduQueryUnits, baiduAuthHeaders } = require('../services/geo-check-baidu-search.service')
  assert.equal(baiduQueryUnits('杭州盈简科技').length, 6)
  const long = '杭州盈简科技有限公司主营汽车维修数字化'.repeat(4)
  const clipped = baiduQueryUnits(long)
  let units = 0
  for (const ch of clipped) units += /[\u4e00-\u9fff]/.test(ch) ? 2 : 1
  assert.ok(units <= 72)
  const headers = baiduAuthHeaders('test-key')
  assert.equal(headers.Authorization, 'Bearer test-key')
  assert.equal(headers['X-Appbuilder-Authorization'], 'Bearer test-key')
})

test('extractJsonObject reads fenced json', () => {
  const obj = extractJsonObject('```json\n{"looksLike":"chat_answer"}\n```')
  assert.equal(obj.looksLike, 'chat_answer')
})

test('consumeDailyLimit blocks after cap', () => {
  const ip = `test-${Date.now()}`
  const first = consumeDailyLimit(ip, 1)
  const second = consumeDailyLimit(ip, 1)
  assert.equal(first.allowed, true)
  assert.equal(second.allowed, false)
})

test('inferMapFromWebHits uses map links when no amap key', () => {
  const result = inferMapFromWebHits(
    [classifySearchHit({ url: 'https://www.amap.com/place/B001', title: '盈简科技' })],
    '盈简科技',
    '杭州',
  )
  assert.equal(result.status, 'ok')
  assert.equal(result.provider, 'web_fallback')
  assert.equal(result.found, true)
})
