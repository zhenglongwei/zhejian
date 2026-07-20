/** 使用说明与帮助 · 车主路径（商家说明见商家工作台 / 套餐选择页） */

const HELP_CENTER_PATHS = [
  {
    id: 'owner',
    label: '车主指南',
    sections: [
      {
        heading: '如何查看服务相册',
        body:
          '请让门店分享相册链接，或使用微信扫一扫打开商家小程序码。' +
          '登录后在「我的服务相册」查看门店为你创建的记录。公开案例可在 H5 内容站浏览。',
      },
      {
        heading: '过程查看与确认',
        body:
          '门店创建相册后可邀请你查看检测、施工、完工等节点。' +
          '若门店发起配件或方案确认，请在推送的确认页核对后再继续（以门店流程为准）。',
      },
      {
        heading: '发布到公开网站',
        body:
          '仅在你主动点「发布到公开网站」并确认后，内容才会进入公开站审核。' +
          '发布前可预览即将上网的内容；通过后出现在 H5，你可撤回。' +
          '公开展示前会脱敏车牌、人脸、VIN、手机号等信息。',
      },
      {
        heading: '隐私与脱敏',
        body:
          '服务相册默认仅相关车主与门店可见。公开内容使用脱敏素材与文案。' +
          '发现未同意公开或隐私问题，可通过「联系客服」或页面「举报虚假信息」反馈。',
      },
      {
        heading: '事故车与复杂维修',
        body:
          '事故车、复杂故障等需到店检测后报价，平台不提供线上估价或维修质量判定。' +
          '可参考 H5 公开案例了解方案与费用影响因素，最终以门店检测为准。有问题请直接电话联系门店。',
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
  '车主：扫描商家二维码或打开门店分享链接查看服务记录；登录后在「我的服务相册」查看；' +
  '可自行决定是否「发布到公开网站」。\n\n' +
  '辙见 — 像一份可翻阅的服务相册，而不是促销传单。公开案例请在 H5 内容站浏览。'

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
