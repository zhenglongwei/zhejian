const COPY = {
  album:
    '服务相册仅本人可见；未经你授权，平台不会公开展示原图。',
  albumMerchant:
    '服务相册仅本人可见。未经用户授权，平台不会公开展示原图。',
  ownerShare:
    '默认以脱敏图分享，不含车牌、手机号等隐私信息。你可选择原图分享，但需自行承担隐私风险。',
  ownerShareOriginal:
    '你已选择原图分享。原图可能包含车牌、手机号、人脸等隐私信息，请谨慎选择分享对象。',
  publicCaseShare:
    '以下为平台已审核的脱敏公示案例；公示网页链接始终为脱敏内容，与上方原图选项无关。',
  share: '分享内容已脱敏，不含车牌、手机号、人脸等个人信息。',
  authorize: '公开前可先查看脱敏效果，确认合适后再授权公示。',
  desensitize:
    '原图仅在本页预览，不会直接进入公开展示；请完成脱敏确认后再授权公示。',
  coldStartPublic:
    '未关联车主的公开案例须完成脱敏并由平台审核。公开页展示系统参考区间，不代表线上成交价。',
}

Component({
  properties: {
    scene: {
      type: String,
      value: 'album',
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
    scene() {
      this.updateContent()
    },
    text() {
      this.updateContent()
    },
  },
  methods: {
    updateContent() {
      const { scene, text } = this.properties
      this.setData({ content: text || COPY[scene] || COPY.album })
    },
  },
})
