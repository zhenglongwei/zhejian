/**
 * PUB-GEO · 案例机审常量（19 §0 · 2026-09-03）
 * 真实性机审分仅内部参考，**不再**作为公开发布硬门禁。
 * CASE_GEO_AUTHENTICITY_PASS 保留供观测/抽检，调用方不得用于挡发。
 */

const CASE_GEO_AUTHENTICITY_PASS = 60

const CASE_GEO_AUDIT_PROMPT_VERSION = 'case-geo-audit-v1'

/** 管道状态（落在 contentPackageJson.caseGeoMeta.pipelineStatus） */
const CASE_GEO_PIPELINE_STATUS = {
  IDLE: 'idle',
  GENERATING: 'generating',
  AUDIT_FAILED: 'audit_failed',
  AUDIT_PASSED: 'audit_passed',
  READY: 'ready',
  PUBLISHED: 'published',
}

module.exports = {
  CASE_GEO_AUTHENTICITY_PASS,
  CASE_GEO_AUDIT_PROMPT_VERSION,
  CASE_GEO_PIPELINE_STATUS,
}
