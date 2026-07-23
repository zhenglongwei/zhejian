/**
 * PKG-COACH-P1-06 · 相册教练规则包运营配置
 * 内置常量 + JSON 覆盖文件热更新（按 mtime 自动失效缓存）。
 */
const fs = require('fs')
const path = require('path')
const builtins = require('../constants/album-coach-rules')

const DEFAULT_OVERRIDE_PATH = path.join(__dirname, '../../data/album-coach-overrides.json')

function resolveOverridePath() {
  return process.env.ALBUM_COACH_OVERRIDE_PATH || DEFAULT_OVERRIDE_PATH
}

/** @type {{ path: string, mtimeMs: number|null, raw: object|null }} */
let cache = { path: '', mtimeMs: null, raw: null }

function deepClone(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value))
}

function emptyOverrides() {
  return {
    version: 1,
    updatedAt: null,
    updatedBy: '',
    commonAvoid: null,
    commonStages: null,
    matchers: null,
    completeChecklist: null,
    servicePacks: {},
  }
}

function readFileSafe(filePath) {
  if (!fs.existsSync(filePath)) return null
  const text = fs.readFileSync(filePath, 'utf8')
  if (!String(text || '').trim()) return null
  return JSON.parse(text)
}

function loadOverrides({ force = false } = {}) {
  const filePath = resolveOverridePath()
  let mtimeMs = null
  try {
    if (fs.existsSync(filePath)) {
      mtimeMs = fs.statSync(filePath).mtimeMs
    }
  } catch (_) {
    mtimeMs = null
  }

  if (
    !force &&
    cache.path === filePath &&
    cache.raw &&
    cache.mtimeMs === mtimeMs
  ) {
    return cache.raw
  }

  let raw = emptyOverrides()
  try {
    const parsed = readFileSafe(filePath)
    if (parsed && typeof parsed === 'object') {
      raw = {
        ...emptyOverrides(),
        ...parsed,
        servicePacks:
          parsed.servicePacks && typeof parsed.servicePacks === 'object'
            ? parsed.servicePacks
            : {},
      }
    }
  } catch (err) {
    console.error('[album-coach-config] failed to read overrides:', err.message)
    raw = emptyOverrides()
  }

  cache = { path: filePath, mtimeMs, raw }
  return raw
}

function writeOverrides(next, { updatedBy = '' } = {}) {
  const filePath = resolveOverridePath()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const payload = {
    ...emptyOverrides(),
    ...next,
    version: Number(next.version) || 1,
    updatedAt: new Date().toISOString(),
    updatedBy: String(updatedBy || next.updatedBy || ''),
    servicePacks:
      next.servicePacks && typeof next.servicePacks === 'object' ? next.servicePacks : {},
  }
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  cache = { path: filePath, mtimeMs: fs.statSync(filePath).mtimeMs, raw: payload }
  return payload
}

function mergeStages(base = {}, override = null) {
  if (!override || typeof override !== 'object') return deepClone(base || {})
  const out = deepClone(base || {})
  Object.keys(override).forEach((stageId) => {
    const ov = override[stageId]
    if (!ov || typeof ov !== 'object') return
    out[stageId] = {
      ...(out[stageId] || {}),
      ...ov,
      shoot_prefer: Array.isArray(ov.shoot_prefer)
        ? ov.shoot_prefer
        : (out[stageId] && out[stageId].shoot_prefer) || [],
      note_hints: Array.isArray(ov.note_hints)
        ? ov.note_hints
        : (out[stageId] && out[stageId].note_hints) || [],
      geo_angle: Array.isArray(ov.geo_angle)
        ? ov.geo_angle
        : (out[stageId] && out[stageId].geo_angle) || [],
      shoot_avoid: Array.isArray(ov.shoot_avoid)
        ? ov.shoot_avoid
        : (out[stageId] && out[stageId].shoot_avoid) || undefined,
    }
    if (out[stageId].shoot_avoid === undefined) {
      delete out[stageId].shoot_avoid
    }
  })
  return out
}

function mergeServicePacks(basePacks, overridePacks) {
  const out = deepClone(basePacks || {})
  if (!overridePacks || typeof overridePacks !== 'object') return out
  Object.keys(overridePacks).forEach((packId) => {
    const ov = overridePacks[packId]
    if (!ov || typeof ov !== 'object') return
    const base = out[packId] || { id: packId, label: packId, stages: {} }
    out[packId] = {
      ...base,
      ...ov,
      id: packId,
      stages: mergeStages(base.stages || {}, ov.stages || {}),
    }
  })
  return out
}

function getRuntimeRules() {
  const ov = loadOverrides()
  return {
    COMMON_AVOID: Array.isArray(ov.commonAvoid)
      ? deepClone(ov.commonAvoid)
      : deepClone(builtins.COMMON_AVOID),
    COMMON_STAGES: mergeStages(builtins.COMMON_STAGES, ov.commonStages),
    SERVICE_TYPE_MATCHERS: Array.isArray(ov.matchers)
      ? deepClone(ov.matchers)
      : deepClone(builtins.SERVICE_TYPE_MATCHERS),
    SERVICE_PACKS: mergeServicePacks(builtins.SERVICE_PACKS, ov.servicePacks),
    COMPLETE_CHECKLIST: Array.isArray(ov.completeChecklist)
      ? deepClone(ov.completeChecklist)
      : deepClone(builtins.COMPLETE_CHECKLIST),
    meta: {
      overridePath: resolveOverridePath(),
      version: ov.version || 1,
      updatedAt: ov.updatedAt || null,
      updatedBy: ov.updatedBy || '',
      hasFile: Boolean(ov.updatedAt || Object.keys(ov.servicePacks || {}).length),
    },
  }
}

function listAdminCoachPacks() {
  const runtime = getRuntimeRules()
  const ov = loadOverrides()
  const packs = [
    {
      id: 'common',
      kind: 'common',
      label: '通用规则（别拍 / 阶段底稿）',
      hasOverride: Boolean(
        ov.commonAvoid || ov.commonStages || ov.completeChecklist || ov.matchers,
      ),
      geoPyramidHint: '',
    },
  ]
  Object.keys(runtime.SERVICE_PACKS).forEach((id) => {
    const pack = runtime.SERVICE_PACKS[id]
    packs.push({
      id,
      kind: 'service',
      label: pack.label || id,
      hasOverride: Boolean(ov.servicePacks && ov.servicePacks[id]),
      geoPyramidHint: pack.geoPyramidHint || '',
      isCustom: !builtins.SERVICE_PACKS[id],
    })
  })
  return {
    packs,
    meta: runtime.meta,
  }
}

function getAdminCoachPack(packId) {
  const id = String(packId || '').trim()
  if (!id) {
    const err = new Error('缺少规则包 id')
    err.status = 400
    throw err
  }
  const runtime = getRuntimeRules()
  const ov = loadOverrides()
  if (id === 'common') {
    return {
      id: 'common',
      kind: 'common',
      label: '通用规则（别拍 / 阶段底稿）',
      hasOverride: Boolean(
        ov.commonAvoid || ov.commonStages || ov.completeChecklist || ov.matchers,
      ),
      builtin: {
        commonAvoid: deepClone(builtins.COMMON_AVOID),
        commonStages: deepClone(builtins.COMMON_STAGES),
        matchers: deepClone(builtins.SERVICE_TYPE_MATCHERS),
        completeChecklist: deepClone(builtins.COMPLETE_CHECKLIST),
      },
      override: {
        commonAvoid: ov.commonAvoid,
        commonStages: ov.commonStages,
        matchers: ov.matchers,
        completeChecklist: ov.completeChecklist,
      },
      merged: {
        commonAvoid: runtime.COMMON_AVOID,
        commonStages: runtime.COMMON_STAGES,
        matchers: runtime.SERVICE_TYPE_MATCHERS,
        completeChecklist: runtime.COMPLETE_CHECKLIST,
      },
      meta: runtime.meta,
    }
  }

  const merged = runtime.SERVICE_PACKS[id]
  if (!merged) {
    const err = new Error('规则包不存在')
    err.status = 404
    throw err
  }
  return {
    id,
    kind: 'service',
    label: merged.label || id,
    hasOverride: Boolean(ov.servicePacks && ov.servicePacks[id]),
    isCustom: !builtins.SERVICE_PACKS[id],
    builtin: builtins.SERVICE_PACKS[id]
      ? deepClone(builtins.SERVICE_PACKS[id])
      : null,
    override: ov.servicePacks && ov.servicePacks[id]
      ? deepClone(ov.servicePacks[id])
      : null,
    merged: deepClone(merged),
    matcher: (runtime.SERVICE_TYPE_MATCHERS || []).find((m) => m.id === id) || null,
    meta: runtime.meta,
  }
}

function assertArrayField(value, field) {
  if (value != null && !Array.isArray(value)) {
    const err = new Error(`${field} 须为数组`)
    err.status = 400
    throw err
  }
}

function saveAdminCoachPack(packId, body = {}, { updatedBy = '' } = {}) {
  const id = String(packId || '').trim()
  if (!id) {
    const err = new Error('缺少规则包 id')
    err.status = 400
    throw err
  }
  const current = loadOverrides({ force: true })
  const next = deepClone(current)

  if (id === 'common') {
    if ('commonAvoid' in body) {
      assertArrayField(body.commonAvoid, 'commonAvoid')
      next.commonAvoid = body.commonAvoid
    }
    if ('commonStages' in body) {
      if (body.commonStages != null && typeof body.commonStages !== 'object') {
        const err = new Error('commonStages 须为对象')
        err.status = 400
        throw err
      }
      next.commonStages = body.commonStages
    }
    if ('matchers' in body) {
      assertArrayField(body.matchers, 'matchers')
      next.matchers = body.matchers
    }
    if ('completeChecklist' in body) {
      assertArrayField(body.completeChecklist, 'completeChecklist')
      next.completeChecklist = body.completeChecklist
    }
  } else {
    const packBody = body.pack || body
    if (!packBody || typeof packBody !== 'object') {
      const err = new Error('请提交规则包内容')
      err.status = 400
      throw err
    }
    next.servicePacks = next.servicePacks || {}
    next.servicePacks[id] = {
      id,
      label: String(packBody.label || id).trim() || id,
      geoPyramidHint: String(packBody.geoPyramidHint || ''),
      stages: packBody.stages && typeof packBody.stages === 'object' ? packBody.stages : {},
    }
    if (Array.isArray(body.matcherKeywords) || Array.isArray(body.matcherTemplates)) {
      const matchers = Array.isArray(next.matchers)
        ? deepClone(next.matchers)
        : deepClone(builtins.SERVICE_TYPE_MATCHERS)
      let row = matchers.find((m) => m.id === id)
      if (!row) {
        row = { id, keywords: [], templates: [] }
        matchers.push(row)
      }
      if (Array.isArray(body.matcherKeywords)) row.keywords = body.matcherKeywords
      if (Array.isArray(body.matcherTemplates)) row.templates = body.matcherTemplates
      next.matchers = matchers
    }
  }

  writeOverrides(next, { updatedBy })
  return getAdminCoachPack(id)
}

function hasMeaningfulOverrides(ov) {
  return Boolean(
    ov.commonAvoid ||
      ov.commonStages ||
      ov.matchers ||
      ov.completeChecklist ||
      Object.keys(ov.servicePacks || {}).length,
  )
}

function clearOverrideFile() {
  const filePath = resolveOverridePath()
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  cache = { path: filePath, mtimeMs: null, raw: emptyOverrides() }
}

function resetAdminCoachPack(packId, { updatedBy = '' } = {}) {
  const id = String(packId || '').trim()
  if (!id) {
    const err = new Error('缺少规则包 id')
    err.status = 400
    throw err
  }
  const current = loadOverrides({ force: true })
  const next = deepClone(current)
  const wasCustom = id !== 'common' && !builtins.SERVICE_PACKS[id]

  if (id === 'common') {
    next.commonAvoid = null
    next.commonStages = null
    next.matchers = null
    next.completeChecklist = null
  } else {
    if (next.servicePacks && next.servicePacks[id]) {
      delete next.servicePacks[id]
    }
    if (wasCustom) {
      if (Array.isArray(next.matchers)) {
        next.matchers = next.matchers.filter((m) => m.id !== id)
      } else if (next.matchers == null) {
        // 仅删内置 matcher 副本中的自定义项：写入过滤后的完整列表
        next.matchers = builtins.SERVICE_TYPE_MATCHERS.filter((m) => m.id !== id)
        if (next.matchers.length === builtins.SERVICE_TYPE_MATCHERS.length) {
          next.matchers = null
        }
      }
    }
  }

  if (!hasMeaningfulOverrides(next)) {
    clearOverrideFile()
  } else {
    writeOverrides(next, { updatedBy })
  }

  if (wasCustom) {
    return {
      deleted: true,
      id,
      list: listAdminCoachPacks(),
    }
  }
  return getAdminCoachPack(id)
}

function createAdminCoachPack(body = {}, { updatedBy = '' } = {}) {
  const id = String(body.id || '')
    .trim()
    .replace(/[^a-z0-9_]/gi, '_')
    .toLowerCase()
  if (!id || id === 'common') {
    const err = new Error('请填写合法规则包 id（字母数字下划线）')
    err.status = 400
    throw err
  }
  const runtime = getRuntimeRules()
  if (runtime.SERVICE_PACKS[id]) {
    const err = new Error('规则包 id 已存在')
    err.status = 409
    throw err
  }
  return saveAdminCoachPack(
    id,
    {
      pack: {
        label: body.label || id,
        geoPyramidHint: body.geoPyramidHint || '',
        stages: body.stages || {},
      },
      matcherKeywords: body.matcherKeywords || body.keywords || [],
      matcherTemplates: body.matcherTemplates || body.templates || [],
    },
    { updatedBy },
  )
}

function reloadAdminCoachConfig() {
  loadOverrides({ force: true })
  return getRuntimeRules().meta
}

module.exports = {
  resolveOverridePath,
  loadOverrides,
  getRuntimeRules,
  listAdminCoachPacks,
  getAdminCoachPack,
  saveAdminCoachPack,
  resetAdminCoachPack,
  createAdminCoachPack,
  reloadAdminCoachConfig,
  emptyOverrides,
}
