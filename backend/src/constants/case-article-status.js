/**
 * DS-B-01 · 案例文章发布渠道状态（与 public_cases.status 审核态分离）
 * 真源文档：docs/11_数据结构与状态机/06_案例文章与GEO字段映射.md
 */
const CASE_ARTICLE_STATUS = {
  /** 尚未生成文章（存量案例默认） */
  PENDING: 'pending',
  /** 已生成草稿，未就绪 */
  DRAFT: 'draft',
  /** 生成完成，待 H5 发布 */
  READY: 'ready',
  /** 已在 H5 以文章形态发布 */
  PUBLISHED_H5: 'published_h5',
  /** 已发公众号（阶段 D） */
  PUBLISHED_WECHAT: 'published_wechat',
}

const CASE_ARTICLE_STATUS_LABELS = {
  [CASE_ARTICLE_STATUS.PENDING]: '待生成',
  [CASE_ARTICLE_STATUS.DRAFT]: '草稿',
  [CASE_ARTICLE_STATUS.READY]: '待发布',
  [CASE_ARTICLE_STATUS.PUBLISHED_H5]: '已发 H5',
  [CASE_ARTICLE_STATUS.PUBLISHED_WECHAT]: '已发公众号',
}

const CASE_ARTICLE_GENERATION_SOURCE = {
  TEMPLATE: 'template',
  AI: 'ai',
  MANUAL: 'manual',
}

module.exports = {
  CASE_ARTICLE_STATUS,
  CASE_ARTICLE_STATUS_LABELS,
  CASE_ARTICLE_GENERATION_SOURCE,
}
