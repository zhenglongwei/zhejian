/**
 * PUB-GEO · 案例机审门禁常量（19 §4.3 · D14）
 * 真实性 ≥60 才可确认发布；痛点加分永不凑及格（G1）。
 */

const CASE_GEO_AUTHENTICITY_PASS = 60

const CASE_GEO_AUDIT_PROMPT_VERSION = 'case-geo-audit-v1'

/** 管道状态（落在 contentPackageJson.caseGeoMeta.pipelineStatus） */
const CASE_GEO_PIPELINE_STATUS = {
  IDLE: 'idle',
  GENERATING: 'generating',
  AUDIT_FAILED: 'audit_failed',
  AUDIT_PASSED: 'audit_passed',
  PUBLISHED: 'published',
}

module.exports = {
  CASE_GEO_AUTHENTICITY_PASS,
  CASE_GEO_AUDIT_PROMPT_VERSION,
  CASE_GEO_PIPELINE_STATUS,
}
