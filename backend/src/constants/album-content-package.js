/**
 * USER-PUB · 完工内容包状态（质量建议 + 多平台长文）
 */

const CONTENT_PACKAGE_STATUS = {
  PENDING: 'pending',
  GENERATING: 'generating',
  READY: 'ready',
  FAILED: 'failed',
  /** 留痕不齐强行完工：不调 LLM */
  SKIPPED: 'skipped',
}

const CONTENT_PACKAGE_SOURCE = {
  LLM: 'llm',
  RULE: 'rule',
  RULE_FALLBACK: 'rule_fallback',
  SKIPPED_INCOMPLETE: 'skipped_incomplete',
}

const GENERATING_WAIT_MESSAGE = '文案准备中，请稍后再试'

module.exports = {
  CONTENT_PACKAGE_STATUS,
  CONTENT_PACKAGE_SOURCE,
  GENERATING_WAIT_MESSAGE,
}
