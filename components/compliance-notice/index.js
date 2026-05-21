const COPY = {
  price: '实际费用以门店检测结果为准，以下价格为参考区间。',
  casePrice:
    '本案例价格仅展示参考区间，实际费用会因车型、配件品牌、损伤程度、维修方案和门店检测结果不同而变化。',
  accident:
    '事故车维修无法仅凭线上信息准确报价。平台不提供线上一口价，请预约门店到店检测后确认维修方案。',
  history: '商家历史案例，非平台订单案例。价格仅供参考。',
  authorize:
    '你的维修档案可供其他车主参考。公开并通过平台审核后，可按平台规则参与利益共享（以政策为准）。平台会自动脱敏车牌、手机号等信息，请你核对后再确认公开。公开版不展示完整订单信息与实际支付金额。',
  reward: '评价奖励须符合平台规则，审核通过后发放，非「好评返现」。',
  desensitize:
    '当前为流程示意：脱敏预览 URL 为 mock，联调后将展示平台真实脱敏图。公开展示仅使用脱敏图，不含车牌等信息。',
  desensitizeGuide:
    '请先点击底部「一键 AI 脱敏」生成预览；手工打码将在后续版本开放。',
  reviewUpload:
    '上传图片将经平台审核。请勿包含完整车牌、人脸、证件等敏感信息；公开展示前会脱敏处理。',
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
      this.setData({ content: text || COPY[type] || COPY.price })
    },
  },
})
