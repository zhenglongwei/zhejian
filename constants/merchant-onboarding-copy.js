/** DS-D-09 · 商家入驻 / 工作台对外口径：工具 + H5 获客，不提「入驻获平台流量」 */

const MERCHANT_ONBOARDING_HERO = {
  title: '成为辙见服务商',
  subtitle: '用服务相册记录过程，授权后在 H5/公众号展示与传播',
}

const MERCHANT_ONBOARDING_VALUE_ITEMS = [
  {
    title: '服务相册工具',
    desc: '记录检测、施工、完工等节点，邀请车主查看过程与配件确认留痕。',
  },
  {
    title: 'H5 案例获客',
    desc: '车主授权后，案例发布至内容站与公众号，可分享、被搜索引用。',
  },
  {
    title: '咨询预约承接',
    desc: '用户从 H5 或分享链进入后可咨询预约，线索回传商家工作台。',
  },
]

const MERCHANT_ONBOARDING_POSITIONING =
  '辙见不分配平台流量、不承诺订单量。入驻开通工具能力；公开获客依赖你店案例内容与自主传播。'

const MERCHANT_WORKBENCH_GATE_NONE = {
  title: '商家工作台',
  description: '入驻后可用服务相册工具、处理咨询线索；授权案例可发布至 H5 内容站',
}

const MERCHANT_WORKBENCH_GATE_PENDING = {
  title: '入驻审核中',
  description: '审核通过后即可使用工作台创建服务相册；案例公开展示在 H5/公众号',
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
