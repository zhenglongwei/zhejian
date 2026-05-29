/** 设置页 — 协议与合规文案（P0 简版） */
const USER_AGREEMENT = {
  title: '用户服务协议',
  updatedAt: '2026-05-28',
  sections: [
    {
      heading: '平台定位',
      body:
        '辙见是汽车维修服务信息展示与咨询预约工具平台。平台提供案例浏览、咨询转接与服务相册工具，不参与线下维修服务、收款、发票与售后。',
    },
    {
      heading: '用户行为规范',
      body:
        '你应合法、真实地使用平台功能，不得上传含完整车牌、人脸、证件等敏感信息的内容，不得发布虚假承诺、诱导分享或违规营销信息。',
    },
    {
      heading: '服务相册与授权',
      body:
        '服务相册由门店创建并与你关联。授权公示须你本人核对脱敏效果并留痕；公开案例仅展示审核通过且已脱敏的内容。',
    },
    {
      heading: '咨询与预约',
      body:
        '咨询/预约信息仅用于门店联系，不构成线上交易订单。实际维修方案、报价与付款由你与门店线下确认。',
    },
  ],
}

const PRIVACY_POLICY = {
  title: '隐私政策',
  updatedAt: '2026-05-28',
  sections: [
    {
      heading: '我们收集的信息',
      body:
        '为提供登录、咨询与服务相册功能，我们可能收集微信标识、手机号（经你授权）、咨询内容、相册关联信息及必要的设备与日志信息。',
    },
    {
      heading: '信息使用',
      body:
        '信息用于账号识别、咨询转接、相册归属、脱敏审核与平台安全。未经你授权，不在公开场景展示完整手机号、车牌或 VIN。',
    },
    {
      heading: '公开与分享',
      body:
        '授权公示的案例经脱敏后公开展示。你自主分享给好友的内容由你本人控制；私人分享链接不等同于平台公示。',
    },
    {
      heading: '你的权利',
      body:
        '你可查看咨询记录与服务相册，管理公开授权，并在设置中申请注销账号。注销后本地登录态清除，公开内容按规则处理。',
    },
  ],
}

const DEACTIVATE_NOTICE = {
  title: '账号注销说明',
  body:
    '注销后账号将不可登录，咨询记录与服务相册查看权限将按法规与隐私政策保留或匿名化处理。平台不提供交易与资金托管，注销不涉及退款处理。已公开且已授权的案例可能按规则下线或匿名化。',
  confirmText: '我已了解后果，确认申请注销',
}

function getLegalDocument(type) {
  if (type === 'privacy') return PRIVACY_POLICY
  return USER_AGREEMENT
}

module.exports = {
  USER_AGREEMENT,
  PRIVACY_POLICY,
  DEACTIVATE_NOTICE,
  getLegalDocument,
}
