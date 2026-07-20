/** 商家入驻 / 工作台对外口径 · 对齐工具收费 + 公示免费（验证期） */

const MERCHANT_ONBOARDING_HERO = {
  title: '成为辙见服务商',
  subtitle: '提交资质与门店资料，审核通过后开通工作台',
}

/** @deprecated 入驻页已不再展示「入驻后可使用」引导区；保留字段避免旧引用报错 */
const MERCHANT_ONBOARDING_VALUE_ITEMS = []

const MERCHANT_ONBOARDING_POSITIONING =
  '辙见是透明成交与合规留证的专用工具，与现有开单系统并存。车主发布的公开案例基础收录不另收费；工具专业版年费以套餐页为准。不做竞价排名、不抽佣，付费不承诺订单量。'

const MERCHANT_WORKBENCH_GATE_NONE = {
  title: '商家工作台',
  description: '入驻审核通过后，先选择套餐说明，再使用服务相册与线索工作台',
}

const MERCHANT_WORKBENCH_GATE_PENDING = {
  title: '入驻审核中',
  description: '审核通过后即可选择套餐并使用工作台创建服务相册',
}

const MERCHANT_SHARE_STORE_DESC = '分享 H5 门店页'

const MERCHANT_STORE_PICKER_COPY = {
  title: '选择门店',
  subtitle: '同一账号可管理多家门店，进入后将使用该门店的工作台数据',
  emptyTitle: '还没有门店',
  emptyDescription: '注册门店并通过审核后，可在此进入商家工作台',
  addStore: '注册新门店',
}

module.exports = {
  MERCHANT_ONBOARDING_HERO,
  MERCHANT_ONBOARDING_VALUE_ITEMS,
  MERCHANT_ONBOARDING_POSITIONING,
  MERCHANT_WORKBENCH_GATE_NONE,
  MERCHANT_WORKBENCH_GATE_PENDING,
  MERCHANT_SHARE_STORE_DESC,
  MERCHANT_STORE_PICKER_COPY,
}
