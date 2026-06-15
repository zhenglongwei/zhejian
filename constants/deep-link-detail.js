/** 深链详情页 · tool-page-shell band 文案（设计体系 §10.1.1 深链型） */
const DEEP_LINK_SHELL = {
  store: {
    title: '门店详情',
    subtitle: '公开案例与服务方案',
  },
  case: {
    title: '公开案例',
    subtitle: '维修过程与方案参考',
  },
  service: {
    title: '服务方案',
    subtitle: '价格说明与类似案例',
  },
}

/** 深链详情共用底栏左操作（收藏态由 favorite-toggle 注入） */
const DEEP_LINK_BOTTOM = {
  case: [
    { key: 'share', type: 'secondary', text: '分享' },
    { key: 'call', type: 'secondary', text: '电话咨询' },
  ],
  store: [
    { key: 'share', type: 'secondary', text: '分享' },
    { key: 'call', type: 'secondary', text: '电话咨询' },
    { key: 'navigate', type: 'secondary', text: '导航' },
  ],
  storePreview: [
    { key: 'call', type: 'secondary', text: '电话咨询' },
    { key: 'navigate', type: 'secondary', text: '导航' },
  ],
}

function buildServiceBottomLeftActions(showCasesLink) {
  const actions = [{ key: 'call', type: 'secondary', text: '电话咨询' }]
  if (showCasesLink) {
    actions.push({ key: 'cases', type: 'ghost', text: '查看案例' })
  }
  return actions
}

module.exports = {
  DEEP_LINK_SHELL,
  DEEP_LINK_BOTTOM,
  buildServiceBottomLeftActions,
}
