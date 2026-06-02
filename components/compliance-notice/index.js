const COPY = {
  price: '实际费用以门店检测结果为准，以下价格为参考区间。',
  casePrice:
    '车主授权公示的案例展示当时方案报价；其余案例价格为系统参考区间，实际费用以门店检测为准。',
  accident:
    '事故车维修无法仅凭线上信息准确报价。请预约门店到店检测后确认维修方案。',
  history: '价格仅供参考，不代表本页报价或最终成交价。',
  authorize:
    '授权公示后，你的服务相册经脱敏处理可供其他车主参考。公开版不展示完整车牌、手机号等信息，请你核对后再确认。公开展示须完成审核。',
  partRisk:
    '该配件并非主机厂原厂件。请确认你已了解配件差异及后续年检、二手车检测、保险理赔或质保判断中可能被识别为非原厂件的风险。',
  reward: '评价奖励须符合活动规则，审核通过后发放，非「好评返现」。',
  desensitize:
    '以下为脱敏预览，公开展示仅使用脱敏图，不含完整车牌、人脸、手机号等信息。请逐张核对后再确认。',
  desensitizeGuide:
    '请先点击底部「一键 AI 脱敏」生成预览；手工打码将在后续版本开放。',
  desensitizePreMaskReview:
    '以下为自动脱敏预览，请逐张核对原图与脱敏图；如有遗漏可使用手工打码补充（即将开放）。',
  reviewUpload:
    '上传图片将经审核。请勿包含完整车牌、人脸、证件等敏感信息；公开展示前会脱敏处理。',
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
    '本页内容由商家自行发布或经车主授权展示，仅供参考。实际方案与费用请与门店线下确认。',
  /** @deprecated 使用 displayDisclaimer */
  platformDisplay:
    '本页内容由商家自行发布或经车主授权展示，仅供参考。实际方案与费用请与门店线下确认。',
}

Component({
  properties: {
    type: {
      type: String,
      value: 'price',
    },
    text: {
      type: String,
      value: '',
    },
  },
  data: {
    content: '',
    prewrap: false,
  },
  lifetimes: {
    attached() {
      this.updateContent()
    },
  },
  observers: {
    type() {
      this.updateContent()
    },
    text() {
      this.updateContent()
    },
  },
  methods: {
    updateContent() {
      const { type, text } = this.properties
      const resolvedType = type === 'platformDisplay' ? 'displayDisclaimer' : type
      this.setData({
        content: text || COPY[resolvedType] || COPY.price,
        prewrap: resolvedType === 'partRisk',
      })
    },
  },
})
