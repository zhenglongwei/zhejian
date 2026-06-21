/**
 * GEO-OBS-D01 · 引擎注册表单测
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseEngineIdList,
  resolveEnabledEngineConfigs,
  resolveEngineRuntimeConfig,
  getEngineDefinition,
  ALL_ENGINE_IDS,
  isRemovedEngine,
} = require('../src/services/geo-probe-engines')
const {
  collectSearchSources,
  analyzeWebSearchEvidence,
  normalizeResponsesInput,
  isDashScopeGenerationUrl,
} = require('../src/services/geo-probe-engines/web-search-chat')

test('parseEngineIdList dedupes and lowercases', () => {
  assert.deepEqual(parseEngineIdList('qwen, Doubao ,kimi,qwen'), ['qwen', 'doubao', 'kimi'])
})

test('registry includes web-search engines including ark deepseek', () => {
  assert.deepEqual(ALL_ENGINE_IDS, ['qwen', 'doubao', 'deepseek', 'kimi', 'wenxin'])
  assert.equal(getEngineDefinition('yuanbao'), null)
  assert.equal(isRemovedEngine('yuanbao'), true)
  assert.equal(getEngineDefinition('qwen')?.webSearchMode, 'enable_search')
  assert.equal(getEngineDefinition('doubao')?.webSearchMode, 'responses_web_search')
  assert.equal(getEngineDefinition('deepseek')?.webSearchMode, 'responses_web_search')
  assert.equal(isRemovedEngine('deepseek'), false)
})

test('removed yuanbao resolves with removed flag', () => {
  const cfg = resolveEngineRuntimeConfig('yuanbao')
  assert.equal(cfg?.removed, true)
  assert.equal(cfg?.removedReason, 'tokenhub_hy3_enhancement_no_search_info')
})

test('resolveEnabledEngineConfigs respects batch limit zero skip', () => {
  const saved = {
    ENGINES: process.env.GEO_PROBE_ENGINES,
    ENGINE: process.env.GEO_PROBE_ENGINE,
    KIMI_LIMIT: process.env.GEO_PROBE_KIMI_BATCH_LIMIT,
  }
  process.env.GEO_PROBE_ENGINES = 'kimi'
  delete process.env.GEO_PROBE_ENGINE
  process.env.GEO_PROBE_KIMI_BATCH_LIMIT = '0'
  assert.equal(resolveEnabledEngineConfigs().length, 0)
  if (saved.ENGINES == null) delete process.env.GEO_PROBE_ENGINES
  else process.env.GEO_PROBE_ENGINES = saved.ENGINES
  if (saved.ENGINE == null) delete process.env.GEO_PROBE_ENGINE
  else process.env.GEO_PROBE_ENGINE = saved.ENGINE
  if (saved.KIMI_LIMIT == null) delete process.env.GEO_PROBE_KIMI_BATCH_LIMIT
  else process.env.GEO_PROBE_KIMI_BATCH_LIMIT = saved.KIMI_LIMIT
})

test('analyzeWebSearchEvidence detects web_search_call', () => {
  const evidence = analyzeWebSearchEvidence(
    {
      output: [
        { type: 'web_search_call', id: 'ws_1' },
        { type: 'message', content: [{ type: 'output_text', text: 'ok' }] },
      ],
    },
    'ok'
  )
  assert.equal(evidence.confirmed, true)
  assert.equal(evidence.hasWebSearchCall, true)
})

test('collectSearchSources extracts nested urls', () => {
  const sources = collectSearchSources({
    search_info: {
      search_results: [{ url: 'https://geo.simplewin.cn/case/a.html', title: '案例' }],
    },
  })
  assert.equal(sources.length, 1)
  assert.equal(sources[0].url, 'https://geo.simplewin.cn/case/a.html')
})

test('collectSearchSources extracts dashscope output.search_info', () => {
  const sources = collectSearchSources({
    output: {
      search_info: {
        search_results: [{ url: 'https://example.com/a', title: 'A' }],
      },
    },
  })
  assert.equal(sources.length, 1)
  assert.equal(sources[0].url, 'https://example.com/a')
})

test('analyzeWebSearchEvidence detects output.search_info', () => {
  const evidence = analyzeWebSearchEvidence(
    {
      output: {
        search_info: {
          search_results: [{ url: 'https://example.com', title: 'x' }],
        },
      },
    },
    'ok'
  )
  assert.equal(evidence.confirmed, true)
  assert.equal(evidence.hasSearchInfoField, true)
})

test('normalizeResponsesInput converts string content', () => {
  const input = normalizeResponsesInput([{ role: 'user', content: 'hello' }])
  assert.equal(input[0].role, 'user')
  assert.deepEqual(input[0].content, [{ type: 'input_text', text: 'hello' }])
})

test('isDashScopeGenerationUrl detects generation endpoint', () => {
  assert.equal(
    isDashScopeGenerationUrl(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'
    ),
    true
  )
  assert.equal(isDashScopeGenerationUrl('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'), false)
})

test('qwen default web search api is dashscope generation', () => {
  const cfg = resolveEngineRuntimeConfig('qwen')
  assert.match(cfg?.apiUrl || '', /text-generation\/generation/)
})
