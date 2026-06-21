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
const { collectSearchSources, analyzeWebSearchEvidence } = require('../src/services/geo-probe-engines/web-search-chat')

test('parseEngineIdList dedupes and lowercases', () => {
  assert.deepEqual(parseEngineIdList('qwen, Doubao ,kimi,qwen'), ['qwen', 'doubao', 'kimi'])
})

test('registry includes web-search engines only (no deepseek)', () => {
  assert.deepEqual(ALL_ENGINE_IDS, ['qwen', 'doubao', 'kimi', 'wenxin', 'yuanbao'])
  assert.equal(getEngineDefinition('qwen')?.webSearchMode, 'enable_search')
  assert.equal(getEngineDefinition('doubao')?.webSearchMode, 'responses_web_search')
  assert.equal(getEngineDefinition('yuanbao')?.webSearchMode, 'enable_enhancement')
  assert.match(getEngineDefinition('yuanbao')?.defaultApiUrl || '', /chat\/completions/)
  assert.equal(getEngineDefinition('deepseek'), null)
  assert.equal(isRemovedEngine('yuanbao'), false)
  assert.equal(isRemovedEngine('deepseek'), true)
})

test('removed engine resolves with removed flag', () => {
  const cfg = resolveEngineRuntimeConfig('deepseek')
  assert.equal(cfg?.removed, true)
  assert.equal(cfg?.removedReason, 'no_web_search_api')
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
