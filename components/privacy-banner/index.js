const COPY = {
  album:
    '服务相册仅本人可见；未经你授权，平台不会公开展示原图。分享将引导生成脱敏公开案例。',
  albumMerchant:
    '服务相册仅本人可见。未经用户授权，平台不会公开展示原图。',
  share: '分享内容已脱敏，不含车牌、手机号、人脸等个人信息。',
  authorize: '公开前可先查看脱敏效果，确认合适后再同意公开。',
  desensitize:
    '原图仅在本页预览，不会直接进入公开展示；请完成脱敏确认后再授权公开。',
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
