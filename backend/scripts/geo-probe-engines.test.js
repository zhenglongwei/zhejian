/**
 * GEO-OBS-D01 · 引擎注册表单测
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseEngineIdList,
  resolveEnabledEngineConfigs,
  getEngineDefinition,
  ALL_ENGINE_IDS,
} = require('../src/services/geo-probe-engines')

test('parseEngineIdList dedupes and lowercases', () => {
  assert.deepEqual(parseEngineIdList('qwen, Doubao ,kimi,qwen'), ['qwen', 'doubao', 'kimi'])
})

test('registry includes five open-api engines', () => {
  assert.deepEqual(ALL_ENGINE_IDS, ['qwen', 'doubao', 'kimi', 'wenxin', 'yuanbao'])
  assert.equal(getEngineDefinition('yuanbao')?.label.includes('混元'), true)
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
