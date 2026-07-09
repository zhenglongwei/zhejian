export const ALBUM_COMPLIANCE_TABS = [
  { key: 'spot_check', label: '待抽检' },
  { key: 'passed', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
]

export const ALBUM_COMPLIANCE_STATUS_LABEL = {
  spot_check: '待抽检',
  passed: '已通过',
  rejected: '已驳回',
  pending: '规则运行中',
}

export const ALBUM_COMPLIANCE_REJECT_REASONS = [
  '违规宣传/导流',
  '禁词命中',
  '联系方式外露',
  '留档与门店信息不符',
  '其他合规问题',
]

export const ALBUM_COMPLIANCE_NOTICES = [
  '闸门 A：审商家留档合法合规（禁词/导流等），不审 pre-mask 实现与用户评价。',
  '通过后用户端冻结展示「门店已提交，内容待您确认」，商家不可再改留档。',
  '驳回后由商家修改相册并重新提交完工/送审。',
]
