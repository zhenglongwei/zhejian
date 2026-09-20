/** 商家开通 / 工作台对外口径 · 软信任（V2.1） */

const MERCHANT_ONBOARDING_HERO = {
  title: '完善门店资料',
  subtitle: '选填；补齐后公开页标签更完整',
}

/** @deprecated 入驻页已不再展示「入驻后可使用」引导区；保留字段避免旧引用报错 */
const MERCHANT_ONBOARDING_VALUE_ITEMS = []

const MERCHANT_ONBOARDING_POSITIONING =
  '辙见是透明成交与合规留证的专用工具，与现有开单系统并存。当前免费使用；车主发布的公开案例基础收录不另收费。不做竞价排名、不抽佣。'

const MERCHANT_WORKBENCH_GATE_NONE = {
  title: '开通商家工作台',
  description: '一键开通即可建相册、托管案例',
}

const MERCHANT_WORKBENCH_GATE_PENDING = {
  title: '可直接开通',
  description: '无需等待审核，点下方进入工作台',
}

const MERCHANT_WORKBENCH_GATE_NONE_ARCHIVE = {
  title: '开通后继续整理',
  description: '开通即可把这一单群聊贴进相册',
}

const MERCHANT_WORKBENCH_GATE_PENDING_ARCHIVE = {
  title: '开通后继续整理',
  description: '点下方开通，接着贴这一单',
}

const MERCHANT_AUTH_HINT = {
  none: '补认证：上传执照与法人证',
  pending: '认证校验中，可继续完善资料',
  failed: '认证未通过，请重传证件',
  verified: '',
}

const MERCHANT_SHARE_STORE_DESC = '分享 H5 门店页'

const MERCHANT_STORE_PICKER_COPY = {
  title: '选择门店',
  subtitle: '同一账号可管理多家门店，进入后将使用该门店的工作台数据',
  emptyTitle: '还没有门店',
  emptyDescription: '开通商家账号后，可在此进入工作台',
  addStore: '注册新门店',
  deleteAction: '删除',
  deleteConfirmTitle: '删除该门店申请？',
  deleteConfirmContent: '删除后不可恢复。仅草稿或历史未通过的申请可删除。',
}

module.exports = {
  MERCHANT_ONBOARDING_HERO,
  MERCHANT_ONBOARDING_VALUE_ITEMS,
  MERCHANT_ONBOARDING_POSITIONING,
  MERCHANT_WORKBENCH_GATE_NONE,
  MERCHANT_WORKBENCH_GATE_PENDING,
  MERCHANT_WORKBENCH_GATE_NONE_ARCHIVE,
  MERCHANT_WORKBENCH_GATE_PENDING_ARCHIVE,
  MERCHANT_AUTH_HINT,
  MERCHANT_SHARE_STORE_DESC,
  MERCHANT_STORE_PICKER_COPY,
}
