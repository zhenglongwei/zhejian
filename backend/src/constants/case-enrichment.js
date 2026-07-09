/**
 * CASE-OPS-02 · 案例快照 vs 提炼层（Enrichment）编辑边界
 */
const { extractSnapshotFromContentJson } = require('../schemas/case-snapshot.schema')

const SNAPSHOT_FROZEN_CODE = 'SNAPSHOT_FROZEN'
const LLM_ADOPT_SNAPSHOT_FROZEN_CODE = 'LLM_ADOPT_SNAPSHOT_FROZEN'

/** 无快照时运营可手改（存量 / 冷启动） */
const LEGACY_GEO_EDITABLE_TOP_FIELDS = ['aiSummary', 'seoTitle', 'seoDescription', 'articleBody']
const LEGACY_GEO_EDITABLE_BLOCK_FIELDS = [
  'faultDesc',
  'inspectResult',
  'repairPlan',
  'resultConfirm',
]

/** 有快照时仅提炼层字段（不写 snapshot / 正文 / 节点聚合段） */
const ENRICHMENT_EDITABLE_TOP_FIELDS = ['aiSummary', 'seoTitle', 'seoDescription']
const ENRICHMENT_EDITABLE_BLOCK_FIELDS = []

const SNAPSHOT_PAYLOAD_FORBIDDEN_KEYS = [
  'snapshot',
  'nodes',
  'title',
  'summary',
  'articleBody',
  'coverImage',
  'vehicle',
  'parts',
  'planParts',
  'price',
]

function hasFrozenCaseSnapshot(contentJson) {
  return Boolean(extractSnapshotFromContentJson(contentJson))
}

/**
 * @param {unknown} contentJson
 * @returns {{ frozen: boolean, topFields: string[], blockFields: string[] }}
 */
function resolveCaseGeoEditPolicy(contentJson) {
  const frozen = hasFrozenCaseSnapshot(contentJson)
  return {
    frozen,
    topFields: frozen ? ENRICHMENT_EDITABLE_TOP_FIELDS : LEGACY_GEO_EDITABLE_TOP_FIELDS,
    blockFields: frozen ? ENRICHMENT_EDITABLE_BLOCK_FIELDS : LEGACY_GEO_EDITABLE_BLOCK_FIELDS,
  }
}

/**
 * @param {object} payload
 * @param {{ frozen?: boolean }} [options]
 */
function assertSnapshotPayloadForbidden(payload = {}, options = {}) {
  if (!options.frozen) return

  for (const key of SNAPSHOT_PAYLOAD_FORBIDDEN_KEYS) {
    if (payload[key] != null) {
      const err = new Error(`字段「${key}」属于案例快照，不可通过运营接口修改`)
      err.status = 409
      err.code = SNAPSHOT_FROZEN_CODE
      throw err
    }
  }

  const nested = payload.contentJson
  if (nested && typeof nested === 'object') {
    if (nested.snapshot != null || nested.nodes != null) {
      const err = new Error('contentJson.snapshot / nodes 不可修改')
      err.status = 409
      err.code = SNAPSHOT_FROZEN_CODE
      throw err
    }
  }

  for (const key of LEGACY_GEO_EDITABLE_BLOCK_FIELDS) {
    if (payload[key] != null) {
      const err = new Error(`字段「${key}」已冻结在授权快照中，请仅编辑 SEO / 摘要提炼层`)
      err.status = 409
      err.code = SNAPSHOT_FROZEN_CODE
      throw err
    }
  }

  if (payload.articleBody != null) {
    const err = new Error('正文 articleBody 已冻结在授权快照中，不可修改')
    err.status = 409
    err.code = SNAPSHOT_FROZEN_CODE
    throw err
  }
}

function buildSnapshotFrozenError(message) {
  const err = new Error(message || '案例快照已冻结，不可修改快照字段')
  err.status = 409
  err.code = SNAPSHOT_FROZEN_CODE
  return err
}

module.exports = {
  SNAPSHOT_FROZEN_CODE,
  LLM_ADOPT_SNAPSHOT_FROZEN_CODE,
  LEGACY_GEO_EDITABLE_TOP_FIELDS,
  LEGACY_GEO_EDITABLE_BLOCK_FIELDS,
  ENRICHMENT_EDITABLE_TOP_FIELDS,
  ENRICHMENT_EDITABLE_BLOCK_FIELDS,
  SNAPSHOT_PAYLOAD_FORBIDDEN_KEYS,
  hasFrozenCaseSnapshot,
  resolveCaseGeoEditPolicy,
  assertSnapshotPayloadForbidden,
  buildSnapshotFrozenError,
}
