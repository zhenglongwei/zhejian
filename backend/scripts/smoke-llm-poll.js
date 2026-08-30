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

// 7. 换题重生成：exclude 里的题不能再出现（老板 4 点优化之「换一批/换一题」）
const { generateBusinessQuestions, fallbackQuestions } = require('../src/services/geo-check-prompts.service')
;(async () => {
  const base = fallbackQuestions('杭州', '汽修')
  const excluded = base.slice(0, 2)
  const regen = await generateBusinessQuestions({ companyName: '某修理厂', city: '杭州', industry: '汽修', exclude: excluded })
  assert(regen.questions.length >= 4, '重生成后题量要够')
  for (const q of regen.questions) {
    assert(!excluded.includes(q), `被排除的题不能再出现：${q}`)
  }

  // 8. 报告精简入库：answerText 必须裁掉，snippet 保留，来源封顶 6 条
  const { trimReportForStorage } = require('../src/services/geo-check-persist.service')
  const fat = {
    companyName: '盈简科技',
    conclusion: { verdict: '测试结论' },
    existence: { score: 50, rows: [{ engine: 'wenxin', sources: Array.from({ length: 10 }, (_, i) => ({ url: `https://a.cn/${i}`, title: 't' })) }] },
    engineResults: [
      {
        id: 'wenxin',
        label: '文心一言（千帆）',
        answers: [
          { question: 'q1', status: 'ok', mentioned: false, answerText: '长'.repeat(6000), answerSnippet: '短摘要', citedUrls: Array.from({ length: 9 }, (_, i) => ({ url: `https://b.cn/${i}`, title: 't' })) },
        ],
      },
    ],
  }
  const trimmed = trimReportForStorage(fat)
  assert.strictEqual(trimmed.conclusion.verdict, '测试结论', '结论必须保留')
  assert.strictEqual(trimmed.engineResults[0].answers[0].answerText, undefined, 'answerText 必须裁掉')
  assert.strictEqual(trimmed.engineResults[0].answers[0].answerSnippet, '短摘要', 'snippet 要保留')
  assert(trimmed.engineResults[0].answers[0].citedUrls.length <= 6, '引用链接要封顶')
  assert(trimmed.existence.rows[0].sources.length <= 6, '存在性来源要封顶')

  console.log('smoke-llm-poll: 8/8 通过')
})().catch((error) => {
  console.error('smoke-llm-poll 失败:', error.message)
  process.exit(1)
})
