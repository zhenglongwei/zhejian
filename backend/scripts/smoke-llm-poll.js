/**
 * geo-check-llm-poll 冒烟测试（不联网，只测纯函数）
 * 用法：node backend/scripts/smoke-llm-poll.js
 */
const assert = require('assert')
const {
  existencePrompt,
  judgeExistence,
  listConfiguredEngines,
  POLL_ENGINES,
} = require('../src/services/geo-check-llm-poll.service')

// 1. 提示词必须带上「名字相近不算数」的纪律
const prompt = existencePrompt('盈简科技', '杭州')
assert(prompt.includes('盈简科技'), 'prompt 应包含企业全名')
assert(prompt.includes('相近'), 'prompt 应包含同名干扰纪律')
assert(prompt.includes('杭州'), 'prompt 应包含城市')

// 2. 来源全名对得上 → 查到（哪怕答案嘴硬）
let verdict = judgeExistence(
  {
    answer: '未查到该企业。',
    searchSources: [{ url: 'https://simplewin.cn/', title: '盈简科技官网', snippet: '杭州盈简科技有限公司' }],
  },
  '盈简科技',
  '杭州',
)
assert.strictEqual(verdict.found, true, '有全名来源时必须判查到')
assert.strictEqual(verdict.sources.length, 1)

// 3. 只有名字相近的公司 → 未查到，且来源被剔除（老板线上事故回归）
verdict = judgeExistence(
  {
    answer: '查到了杭州盈简广告有限公司、江苏简盈科技公司等企业。',
    searchSources: [
      { url: 'https://qcc.com/a', title: '杭州盈简广告有限公司', snippet: '注册资本100万' },
      { url: 'https://qcc.com/b', title: '江苏简盈科技', snippet: '成立于2019' },
    ],
  },
  '盈简科技',
  '杭州',
)
assert.strictEqual(verdict.found, false, '只带「盈」或「简」字的公司不能算数')
assert.strictEqual(verdict.sources.length, 0, '对不上全名的来源必须全部剔除')
assert.strictEqual(verdict.droppedUnrelated, 2)

// 4. 答案开头明确否认且无来源 → 未查到（防「未查到名为『盈简科技』」句中全名误判）
verdict = judgeExistence(
  { answer: '未查到名为「盈简科技」的企业或门店。检索结果中没有相关信息。', searchSources: [] },
  '盈简科技',
  '杭州',
)
assert.strictEqual(verdict.found, false, '否认句式不能因句中带全名而误判为查到')

// 5. 答案正文出现全名且无否认 → 查到（无来源也可，但 note 要说明）
verdict = judgeExistence(
  { answer: '查到。盈简科技是一家位于杭州的科技公司，官网为 simplewin.cn。', searchSources: [] },
  '盈简科技',
  '杭州',
)
assert.strictEqual(verdict.found, true)
assert(verdict.note.includes('没给出可核对的来源链接'), '无来源时 note 要如实说明')

// 6. 引擎清单结构（本机无 key 时应为空或仅含已配置项）
const engines = listConfiguredEngines()
assert(Array.isArray(engines))
assert(POLL_ENGINES.length === 6, '轮询引擎应为 6 家')
assert.strictEqual(POLL_ENGINES[0].id, 'wenxin', '百度千帆排第一')

console.log('smoke-llm-poll: 6/6 通过')
