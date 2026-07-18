const COPY = {
  album:
    '服务相册仅本人可见；未经你确认发布，不会出现在公开网站。',
  albumMerchant:
    '服务相册仅本人可见。未经用户确认发布，不会出现在公开网站。',
  ownerShare:
    '以脱敏图分享，不含车牌、手机号等隐私信息。发给微信或复制文案不会自动出现在公开网站。',
  ownerShareOriginal:
    '（已废止原图分享）原图可能包含车牌、手机号、人脸等隐私信息，请谨慎选择分享对象。',
  publicCaseShare:
    '以下为已审核、已发布到公开网站的脱敏案例；公开网页链接始终为脱敏内容。',
  share: '分享内容已脱敏，不含车牌、手机号、人脸等个人信息。',
  authorize: '公开前可先查看脱敏效果，确认合适后再发布到公开网站；须审核通过后才会展示。',
  desensitize:
    '原图仅在本页预览，不会直接进入公开展示；请完成脱敏确认后再发布到公开网站。',
  partVerify:
    '请按门店提供的验真方式核对登记信息；平台不鉴定配件真伪，也不保证与已装到车上的实物一致；关键更换建议在场或到店复核。',
  coldStartPublic:
    '未关联车主的公开案例须完成脱敏并经审核。公开页展示系统参考区间，不代表线上成交价。',
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
