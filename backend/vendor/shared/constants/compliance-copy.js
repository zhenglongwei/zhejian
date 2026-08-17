/** 合规文案真源 · L3 提示 + L2 场景授权短句 · 同步设计体系 §9.4 */
const { LEGAL_VERSION } = require('./legal-meta')

/** L2 场景授权勾选文案 — 须与 authorization_log.auth_type + auth_text_version 留痕 */
const AUTHORIZATION_CONSENT = {
  login: {
    authType: 'login',
    version: LEGAL_VERSION,
    text:
      '我已阅读并同意《用户服务协议》《隐私政策》及《用户隐私保护指引》',
  },
  consult_transfer: {
    authType: 'consult_transfer',
    version: LEGAL_VERSION,
    text:
      '我已知晓实际维修服务由门店线下提供，同意将咨询信息发送给所选门店，并知晓平台仅提供信息展示与咨询转接',
  },
  accident_ack: {
    authType: 'accident_ack',
    version: LEGAL_VERSION,
    text: '我已知晓事故车须到店检测后由门店报价，平台不提供线上最终报价',
  },
  album_claim: {
    authType: 'album_claim',
    version: LEGAL_VERSION,
    text:
      '我同意使用当前绑定手机号关联此服务相册；相册内容默认仅本人可见，公开须另行确认。',
  },
  album_processing: {
    authType: 'album_processing',
    version: LEGAL_VERSION,
    text:
      '我知晓门店将为本车创建服务相册，同意辙见处理维修过程图片（含自动脱敏、OCR 识别、AI 辅助阅读等），仅用于本人查看与争议留档。',
  },
  /** @deprecated PV-REFORM 废止原图私人分享；保留仅供历史留痕查询 */
  share_raw: {
    authType: 'share_raw',
    version: LEGAL_VERSION,
    text:
      '我知晓原图分享可能泄露车牌、人脸等隐私信息，自行承担传播风险。',
  },
  merchant_album_owner: {
    authType: 'merchant_album_owner',
    version: LEGAL_VERSION,
    text:
      '我确认已向车主说明服务相册用途，车主将扫码确认关联后方可上传维修过程图片。',
  },
  case_public: {
    authType: 'case_public',
    version: LEGAL_VERSION,
    text:
      '本人已阅读并知晓《公开案例与隐私说明》：门店可能把打码施工说明放到店页；不合适可从店页撤下。',
  },
  desensitize_confirm: {
    authType: 'desensitize_confirm',
    version: LEGAL_VERSION,
    text:
      '本人已阅读并知晓《公开案例与隐私说明》：店页只用打码图；发给微信不会自动进店页。',
  },
  case_revoke: {
    authType: 'case_revoke',
    version: LEGAL_VERSION,
    text: '我确认把这条打码说明从店页撤下，公开页将尽快不再展示',
  },
  case_block: {
    authType: 'case_block',
    version: LEGAL_VERSION,
    text: '我确认先不要公开这条打码说明，相册仍只给我和门店看',
  },
  merchant_generate_case: {
    authType: 'merchant_generate_case',
    version: LEGAL_VERSION,
    text:
      '公开内容仅为打码后的施工过程记录，不含车牌、人脸、VIN、手机号；已或将通过平台通知车主，车主可选择不公开或事后撤下；不得以不让公开就不给车或取消质保胁迫；不得把能识别车主身份的信息写进说明。',
  },
  merchant_onboard: {
    authType: 'merchant_onboard',
    version: LEGAL_VERSION,
    text: '我已阅读并同意《商家服务协议》，并确认所提交入驻资料真实有效',
  },
  merchant_history: {
    authType: 'merchant_history',
    version: LEGAL_VERSION,
    text:
      '我确认上传内容已取得必要授权或不含他人隐私，对真实性及合法性承担全部责任',
  },
  merchant_document_ocr: {
    authType: 'merchant_document_ocr',
    version: LEGAL_VERSION,
    text:
      '我同意将本张单据图提交阿里云 OCR 文字识别，仅用于辅助填写方案/定损/结算信息；识别结果须由我核对确认。',
  },
  subscription_pay: {
    authType: 'subscription_pay',
    version: LEGAL_VERSION,
    text:
      '我已阅读并同意《套餐与工具服务协议》，知晓当前工具权益与使用规则',
  },
  album_review: {
    authType: 'album_review',
    version: LEGAL_VERSION,
    text:
      '我确认反馈基于本次真实维修体验，不含虚假或诱导性内容；上传图片不含完整车牌、人脸等敏感信息',
  },
  review_public: {
    authType: 'review_public',
    version: LEGAL_VERSION,
    text: '同意将反馈文字、评分与脱敏后配图展示在已分享的脱敏案例中',
  },
  part_verify: {
    authType: 'part_verify',
    version: LEGAL_VERSION,
    text:
      '我理解验真为自愿对照留痕，平台不鉴定配件真伪，也不保证与已装到车上的实物一致',
  },
  album_feedback: {
    authType: 'album_feedback',
    version: LEGAL_VERSION,
    text: '我理解平台仅协助将反馈转达门店，不介入线下维修质量判定与售后仲裁',
  },
  report: {
    authType: 'report',
    version: LEGAL_VERSION,
    text: '我确认举报内容真实，知晓恶意举报可能承担法律责任',
  },
  deactivate: {
    authType: 'deactivate',
    version: LEGAL_VERSION,
    text: '我已了解注销后果，确认申请注销',
  },
}

function getAuthorizationConsent(authType) {
  const entry = Object.values(AUTHORIZATION_CONSENT).find((item) => item.authType === authType)
  return entry || null
}

/** 公开案例协议书名号（勾选文案中可点开的链接） */
const PUBLIC_CASE_POLICY_LINK = '《公开案例与隐私说明》'

/**
 * 将含协议书名号的勾选文案拆成「前文 + 链接 + 后文」，便于链接插在句中。
 * @param {string} fullText
 * @param {boolean} [showLink=true]
 */
function splitConsentWithPolicyLink(fullText, showLink = true) {
  const text = String(fullText || '')
  const link = PUBLIC_CASE_POLICY_LINK
  const idx = text.indexOf(link)
  if (!showLink) {
    return { before: text, link: '', after: '' }
  }
  if (idx < 0) {
    return { before: text, link, after: '' }
  }
  return {
    before: text.slice(0, idx),
    link,
    after: text.slice(idx + link.length),
  }
}

const COMPLIANCE_COPY = {
  price: '到店检测后确定。',
  casePrice:
    '公开案例不展示成交金额；方案与费用请与门店到店确认。',
  authorizedCaseFixed:
    '本案例为车主分享的脱敏维修记录，公开页不展示成交金额；方案与费用请到店确认。',
  accident: '到店检测后确定。',
  history: '价格仅供参考，不代表本页报价或最终成交价。',
  authorize:
    '分享前请核对脱敏效果。公开站不展示完整车牌、手机号等信息；低风险立即展示，高风险审核通过后可供同城车友参考，你可随时下架。',
  partRisk:
    '该配件并非主机厂原厂件。请确认你已了解配件差异及后续年检、二手车检测、保险理赔或质保判断中可能被识别为非原厂件的风险。',
  partVerify:
    '请按门店提供的验真方式核对登记信息；平台不鉴定配件真伪，也不保证与已装到车上的实物一致；关键更换建议在场或到店复核。',
  planPartsLock:
    '识别结果仅供参考，请以你确认的报价表为准；确认后将锁定方案配件目录，供阶段四录入与车主验真参考。',
  /** 公示激励合规短句 · 非好评返现 */
  publicCaseIncentive:
    '公示激励按平台规则与实际浏览、到店等效果结算，审核通过后发放；非好评返现、非分享领现。',
  /** @deprecated 使用 publicCaseIncentive */
  reward: '公示激励按平台规则与实际浏览、到店等效果结算，审核通过后发放；非好评返现、非分享领现。',
  desensitize:
    '以下为脱敏预览，对外展示仅使用脱敏图，不含完整车牌、人脸、手机号等信息。请逐张核对后再确认。',
  desensitizeGuide:
    '请先点击底部「一键 AI 脱敏」生成预览；手工打码将在后续版本开放。',
  desensitizePreMaskReview:
    '以下为自动脱敏预览，请逐张核对原图与脱敏图；如有遗漏可使用手工打码补充（即将开放）。',
  reviewImageTip:
    '配图默认仅你与门店可见；若随脱敏案例对外分享，将自动脱敏后展示；建议尽量避免完整车牌、人脸、证件。',
  reportImageTip: '截图将随举报一并提交，仅用于核实处理。请勿上传与举报无关的内容。',
  /** @deprecated 使用 reviewImageTip 或 reportImageTip */
  reviewUpload:
    '配图默认仅你与门店可见。勾选公开展示后将自动脱敏，并在脱敏案例中展示；建议尽量避免完整车牌、人脸、证件。',
  consult:
    '你的咨询信息将发送给所选门店，便于门店与你联系。此处不提供线上最终报价，不参与线下维修服务、收款、发票、质保和售后。实际维修方案和费用需你与门店线下确认。',
  consultRecord:
    '本记录仅为咨询/预约信息，不代表线上交易订单。实际维修服务、报价和付款由用户与门店线下完成。',
  consultPrivacy:
    '咨询信息仅用于门店联系，不会公开展示完整车牌或手机号。',
  consultImage:
    '上传图片仅你与门店可见，不会对外公开。',
  consultMerchant:
    '本线索仅为咨询/预约信息转接，不代表线上交易订单。实际维修、报价、收款与售后由你与用户线下确认。',
  consultImageMerchant:
    '上传图片仅咨询用户与本店可见，不会对外公开。',
  displayDisclaimer:
    '本页内容由商家自行发布或经车主确认展示，仅供参考。实际方案与费用请与门店线下确认。',
  aiInspection:
    'AI 说明基于本相册摘要与照片备注，帮助你理解门店记录的服务过程，不构成鉴定或质检结论，可能有遗漏。\n\n' +
    '平台不鉴定配件真伪；相册无法覆盖未入镜施工等情况。\n\n' +
    '若有疑问，可先向门店核对；需要时再到场验车，或委托有资质第三方。事故维修可向保险公司了解复检途径。',
  reportConsent: AUTHORIZATION_CONSENT.report.text,
  albumClaim: AUTHORIZATION_CONSENT.album_claim.text,
  albumProcessing: AUTHORIZATION_CONSENT.album_processing.text,
  albumClaimPrivacyIntro:
    '门店为你创建了服务相册，用于记录本次维修过程。关联前请阅读以下说明：\n\n' +
    '1. 相册默认仅你与门店可见，不会自动公开\n' +
    '2. 平台将处理维修过程图片（含脱敏、OCR、AI 辅助阅读），用于留档与争议证据；门店可能对报价单/定损单/结算单使用 OCR 辅助录入，公开页不含单据原图\n' +
    '3. 门店可能把打码施工说明放到店页。不合适可从店页撤下\n' +
    '4. 可在「我的服务相册」里处理',
  merchantGenerateAttest: [],
  notifyWindowOwner:
    '店里想把这次维修的打码施工说明放到店页，没有车牌和人脸。打开相册就能看。不合适的话选「先不要公开」；这两天没回音会放上去，之后也随时能撤。',
  notifyWindowSms:
    '{store}想把这次「{service}」的打码施工说明放到店页，没有车牌和人脸。打开链接能看；不合适选「先不要公开」。{hours}小时内没回复会放上去，之后也能撤。',
  auditQualityDisclaimer:
    '平台审核针对隐私打码与宣传合规，不代表对维修质量或配件真伪作出保证。',
  storefrontWindowHint:
    '近 90 天完工 {completed} 本，公开 {published} 条。公开记录由门店选出，不代表全部完工。',
  merchantDocumentOcr:
    AUTHORIZATION_CONSENT.merchant_document_ocr.text,
  /** @deprecated 使用 displayDisclaimer */
  platformDisplay:
    '本页内容由商家自行发布或经车主确认展示，仅供参考。实际方案与费用请与门店线下确认。',
}

/** §9.4.3 pages/report/result */
const REPORT_SUCCESS_MESSAGE = '已收到，我们将在 3 个工作日内处理'

module.exports = {
  AUTHORIZATION_CONSENT,
  getAuthorizationConsent,
  PUBLIC_CASE_POLICY_LINK,
  splitConsentWithPolicyLink,
  COMPLIANCE_COPY,
  REPORT_SUCCESS_MESSAGE,
}
