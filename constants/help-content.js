/** 使用说明与帮助 · 车主路径（商家说明见商家工作台 / 套餐选择页） */

const HELP_CENTER_PATHS = [
  {
    id: 'owner',
    label: '车主指南',
    sections: [
      {
        heading: '如何使用相册',
        body:
          '请让门店分享相册链接，或使用微信扫一扫打开商家小程序码。' +
          '登录后在「我的服务相册」查看门店为您创建的记录。',
      },
      {
        heading: '过程查看与确认',
        body:
          '门店创建相册后，可邀请您查看检测、施工、完工等节点。' +
          '若门店发起配件或方案确认，请在推送的确认页核对后再继续（以门店流程为准）。',
      },
      {
        heading: '网上的公开档案',
        body:
          '你在小程序里看的是本次维修记录。要不要出现在公开案例站，由门店托管时选择。' +
          '公开页会对车牌、人脸、VIN、手机号等做打码处理。',
      },
      {
        heading: '隐私与脱敏',
        body:
          '服务相册默认仅您与门店可见。公开案例站只展示与服务直接相关并经过打码的照片。' +
          '若您发现未经同意公开的内容或隐私问题，可通过「联系客服」或页面「举报虚假信息」反馈。',
      },
      {
        heading: '公开案例站',
        body:
          '商家选择公开的案例在公开案例站查看。地址：https://zhejian.simplewin.cn/',
      },
    ],
  },
]

/** 兼容旧引用：平台身份已迁至 constants/about-zhejian.js */
const {
  ABOUT_ZHEJIAN_IDENTITY,
  ABOUT_ZHEJIAN_NOTES,
} = require('./about-zhejian')

const HELP_CENTER_IDENTITY = ABOUT_ZHEJIAN_IDENTITY
const HELP_CENTER_ABOUT = {
  heading: '关于平台',
  items: ABOUT_ZHEJIAN_NOTES,
}

/** 兼容旧版弹窗摘要 */
const TOOL_HELP_CONTENT =
  '车主：扫描商家二维码或打开门店分享链接查看服务记录；登录后在「我的服务相册」查看。\n\n' +
  '辙见 — 像一份可翻阅的服务相册，而不是促销传单。公开案例请在公开案例站浏览。'

function buildHelpCenterTabs() {
  return HELP_CENTER_PATHS.map((path) => ({ key: path.id, label: path.label }))
}

function getHelpPathSections(pathId) {
  const path = HELP_CENTER_PATHS.find((p) => p.id === pathId)
  return path ? path.sections : HELP_CENTER_PATHS[0].sections
}

module.exports = {
  HELP_CENTER_IDENTITY,
  HELP_CENTER_PATHS,
  HELP_CENTER_ABOUT,
  TOOL_HELP_CONTENT,
  buildHelpCenterTabs,
  getHelpPathSections,
}
