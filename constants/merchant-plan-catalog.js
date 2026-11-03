/**
 * 商家四档月费对照（与 docs/03_商家端/05_商家套餐与权益.md 对齐）
 * 页面优先用接口；此处仅作离线回落。
 */

const MERCHANT_PLAN_ORDER = ['taste', 'micro', 'standard', 'scale']

const DEFAULT_PLAN_COLUMNS = [
  {
    planCode: 'taste',
    name: '尝鲜版',
    albumLabel: '不限',
    caseQuotaLabel: '≤3个',
    aiQuotaLabel: '≤3个',
    publicHostQuotaLabel: '≤3个',
    priceCents: 2900,
    priceLabel: '¥29/月',
  },
  {
    planCode: 'micro',
    name: '小微店',
    albumLabel: '不限',
    caseQuotaLabel: '≤20个',
    aiQuotaLabel: '≤20个',
    publicHostQuotaLabel: '≤20个',
    priceCents: 8900,
    priceLabel: '¥89/月',
  },
  {
    planCode: 'standard',
    name: '标准店',
    albumLabel: '不限',
    caseQuotaLabel: '≤100个',
    aiQuotaLabel: '≤100个',
    publicHostQuotaLabel: '≤100个',
    priceCents: 24900,
    priceLabel: '¥249/月',
  },
  {
    planCode: 'scale',
    name: '规模店',
    albumLabel: '不限',
    caseQuotaLabel: '≤200个',
    aiQuotaLabel: '≤200个',
    publicHostQuotaLabel: '≤200个',
    priceCents: 49900,
    priceLabel: '¥499/月',
  },
]

/** 权益维度顺序（页面按版本分行） */
const FEATURE_ROWS = [
  { key: 'album', label: '相册生成' },
  { key: 'ai', label: 'AI分析' },
  { key: 'publicHost', label: '公开托管' },
  { key: 'price', label: '价格' },
]

function buildPricingTableFromColumns(columns = DEFAULT_PLAN_COLUMNS, currentPlanCode = '') {
  const cols = Array.isArray(columns) && columns.length ? columns : DEFAULT_PLAN_COLUMNS
  const planColumns = cols.map((col) => ({
    ...col,
    current: Boolean(currentPlanCode) && col.planCode === currentPlanCode,
  }))
  return {
    columns: planColumns,
    // 兼容旧消费方；商家收费页按 columns 分行渲染
    rows: FEATURE_ROWS.map((row) => ({
      key: row.key,
      label: row.label,
      cells: cols.map((col) => {
        if (row.key === 'album') return col.albumLabel || '不限'
        if (row.key === 'ai') return col.aiQuotaLabel || col.caseQuotaLabel || ''
        if (row.key === 'publicHost') return col.publicHostQuotaLabel || col.caseQuotaLabel || ''
        if (row.key === 'caseHost') return col.caseQuotaLabel || ''
        return col.priceLabel || ''
      }),
    })),
  }
}

module.exports = {
  MERCHANT_PLAN_ORDER,
  DEFAULT_PLAN_COLUMNS,
  FEATURE_ROWS,
  buildPricingTableFromColumns,
}
