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
const { extractJsonObject } = require('./extract-json')
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
  assert.equal(textMentionsName('杭州叙简科技股份有限公司', '盈简科技', '杭州'), false)
  assert.equal(textMentionsName('筑巢杭城盈嘉计算健康科技', '盈简科技', ''), false)
})

test('filterHitsByCompanyName drops lookalike companies', () => {
  const { filterHitsByCompanyName } = require('./geo-check-classify')
  const hits = [
    classifySearchHit({ url: 'https://simplewin.cn/', title: '杭州盈简科技有限公司' }),
    classifySearchHit({ url: 'https://example.com/xujian', title: '杭州叙简科技股份有限公司' }),
    classifySearchHit({ url: 'https://example.com/yingjia', title: '盈嘉计算健康科技' }),
    classifySearchHit({ url: 'https://example.com/yamei', title: '亚美公司官方网站' }),
  ]
  const { matched, dropped } = filterHitsByCompanyName(hits, '盈简科技')
  assert.equal(matched.length, 1)
  assert.equal(matched[0].host, 'simplewin.cn')
  assert.equal(dropped.length, 3)
})

test('pickOfficialSite prefers 官网 title and skips directories', () => {
  const { pickOfficialSite, classifySearchHit } = require('./geo-check-classify')
  const hits = [
    classifySearchHit({ url: 'https://aiqicha.baidu.com/s?q=1', title: '盈简科技官网' }),
    classifySearchHit({ url: 'https://simplewin.cn/', title: '杭州盈简科技有限公司官网' }),
    classifySearchHit({ url: 'https://old.example.com/about', title: '盈简科技介绍' }),
  ]
  const pick = pickOfficialSite(hits, '盈简科技')
  assert.equal(pick.chosen.host, 'simplewin.cn')
  assert.ok(pick.otherCandidates.length >= 1)
})

test('hitInEcosystem tags douyin and weixin', () => {
  const { hitInEcosystem, classifySearchHit, classifyHost } = require('./geo-check-classify')
  assert.equal(classifyHost('www.douyin.com').id, 'bytedance')
  assert.equal(classifyHost('mp.weixin.qq.com').id, 'weixin')
  const dy = classifySearchHit({ url: 'https://www.douyin.com/user/1', title: '盈简科技' })
  assert.equal(hitInEcosystem(dy, 'bytedance'), true)
  assert.equal(hitInEcosystem(dy, 'tencent'), false)
})

test('stripCompanyName removes brand from generated questions', () => {
  const { stripCompanyName, sanitizeQuestions } = require('../services/geo-check-prompts.service')
  assert.equal(stripCompanyName('杭州盈简科技做GEO靠谱吗', '盈简科技').includes('盈简科技'), false)
  const questions = sanitizeQuestions(
    ['杭州盈简科技汽车保养注意什么？', '杭州汽车保养一般要注意哪些项目？'],
    '盈简科技',
    '杭州',
    '汽修',
  )
  assert.ok(questions.every((item) => !item.includes('盈简科技')))
  assert.ok(questions.length >= 4)
})

test('assertPublicHttpUrl blocks localhost', () => {
  const { assertPublicHttpUrl, isPrivateIp, robotsBlocksAll, extractJsonLdTypes } = require('../services/geo-check-official.service')
  assert.equal(isPrivateIp('127.0.0.1'), true)
  assert.equal(isPrivateIp('8.8.8.8'), false)
  assert.throws(() => assertPublicHttpUrl('http://127.0.0.1/'))
  assert.throws(() => assertPublicHttpUrl('file:///etc/passwd'))
  assert.equal(robotsBlocksAll('User-agent: *\nDisallow: /\n'), true)
  const types = extractJsonLdTypes(
    '<script type="application/ld+json">{"@type":"Organization","name":"盈简"}</script>',
  )
  assert.ok(types.includes('Organization'))
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
