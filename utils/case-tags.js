const MAX_TAGS = 3

/**
 * 公开案例标准标签行（2026-09-03：商家上传 · 已脱敏；禁止「已审核」「用户授权」）
 */
function buildCaseTags() {
  return [
    { variant: 'history', text: '商家上传' },
    { variant: 'desensitized', text: '已脱敏' },
  ].slice(0, MAX_TAGS)
}

/** 门店页列表：合规状态，无「已审核」 */
function buildCaseTrustTags() {
  return [
    { variant: 'default', text: '商家上传' },
    { variant: 'default', text: '已脱敏' },
  ]
}

module.exports = { buildCaseTags, buildCaseTrustTags }
