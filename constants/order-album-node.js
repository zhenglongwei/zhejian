/**
 * 订单相册节点 — 对齐 docs/04_维修过程相册/02_相册模板与节点规则.md §4.2
 */
const NODE_REQUIRED_LEVEL = {
  REQUIRED: 'required',
  RECOMMENDED: 'recommended',
  OPTIONAL: 'optional',
}

const NODE_REQUIRED_LEVEL_LABEL = {
  [NODE_REQUIRED_LEVEL.REQUIRED]: '必拍',
  [NODE_REQUIRED_LEVEL.RECOMMENDED]: '推荐',
  [NODE_REQUIRED_LEVEL.OPTIONAL]: '可选',
}

/** Tag variant — 见 components/tag */
const NODE_REQUIRED_LEVEL_TAG = {
  [NODE_REQUIRED_LEVEL.REQUIRED]: 'warning',
  [NODE_REQUIRED_LEVEL.RECOMMENDED]: 'info',
  [NODE_REQUIRED_LEVEL.OPTIONAL]: 'default',
}

const NODE_TYPE = {
  BEFORE: 'before',
  PARTS: 'parts',
  PROCESS: 'process',
  AFTER: 'after',
  CHECK: 'check',
  OTHER: 'other',
}

module.exports = {
  NODE_REQUIRED_LEVEL,
  NODE_REQUIRED_LEVEL_LABEL,
  NODE_REQUIRED_LEVEL_TAG,
  NODE_TYPE,
}
