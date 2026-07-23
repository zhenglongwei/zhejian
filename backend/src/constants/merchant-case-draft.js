/**
 * PKG-COACH · 商家案例草稿章节（公域知识包正文结构）
 * @see docs/04_维修过程相册/15_公域知识包与相册教练规则引擎.md §10
 */

const MERCHANT_CASE_SECTION_KEYS = [
  { key: 'symptom', title: '症状与诉求', stageIds: ['stage_1'] },
  { key: 'diagnosis', title: '诊断与数据', stageIds: ['stage_2'] },
  { key: 'plan', title: '方案与避坑', stageIds: ['stage_3'] },
  { key: 'process', title: '施工与 5S 标准', stageIds: ['stage_5', 'stage_4'] },
  { key: 'handover', title: '旧件与责任边界', stageIds: ['stage_6'] },
]

/** 配图优先挂到这些小节 */
const MEDIA_SECTION_BY_NODE = {
  stage_2: 'diagnosis',
  stage_4: 'process',
  stage_5: 'process',
  stage_6: 'handover',
}

const AMOUNT_PATTERN =
  /(\d[\d,]*(?:\.\d+)?\s*元|¥\s*\d|￥\s*\d|约\s*\d[\d,]*(?:\.\d+)?\s*元|共计\s*\d|参考费用[^。；;\n]*|成交价[^。；;\n]*|报价\s*\d[\d,]*)/gu

module.exports = {
  MERCHANT_CASE_SECTION_KEYS,
  MEDIA_SECTION_BY_NODE,
  AMOUNT_PATTERN,
}
