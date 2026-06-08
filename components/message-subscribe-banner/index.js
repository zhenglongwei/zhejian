Component({
  properties: {
    title: {
      type: String,
      value: '微信通知',
    },
    description: {
      type: String,
      value: '每次点击授权可接收 1 条微信通知，重要操作前请再次授权',
    },
    buttonText: {
      type: String,
      value: '开启微信通知',
    },
  },
  methods: {
    onSubscribe() {
      this.triggerEvent('subscribe')
    },
  },
})
