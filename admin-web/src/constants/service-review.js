export const SERVICE_TABS = [
  { key: 'online', label: '已上架' },
  { key: 'offline', label: '未上架' },
  { key: 'suspended', label: '平台处罚' },
  { key: 'all', label: '全部' },
]

export const SERVICE_PENALTY_REASONS = [
  '虚假宣传',
  '价格误导',
  '资质不符',
  '诱导线下交易',
  '用户投诉核实',
  '抽查不通过',
  '其他违规',
]

export const COMPLIANCE_NOTICES = [
  '平台不对商家服务价格与维修质量负责；本页用于抽查与违规处罚，非前置审核。',
  '处罚措施包括：强制下架服务、限制预约；严重违规可联动商家/门店冻结（见商家审核）。',
  '平台监管重点为公开案例资源的合规与脱敏。',
]

export const PRICE_MODE_LABEL = {
  fixed: '一口价',
  range: '参考区间',
  consult: '到店检测',
  accident: '事故车预约',
}

export const SPOT_CHECK_RESULTS = [
  { value: 'pass', label: '抽查通过' },
  { value: 'fail', label: '抽查不通过' },
]
