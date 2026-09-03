Page({
  data: {
    chatText: '',
    loading: false,
    message: '',
  },

  onInput(e) {
    this.setData({ chatText: (e.detail && e.detail.value) || '' })
  },

  async onGenerate() {
    const text = String(this.data.chatText || '').trim()
    if (!text) {
      wx.showToast({ title: '请先粘贴群聊文字', icon: 'none' })
      return
    }
    this.setData({ loading: true, message: '' })
    try {
      // 三期：接 /api/v1/public/wechat-archive 或商家专用建册接口，落相册+单据
      this.setData({
        message:
          '已收到文案（' +
          text.length +
          ' 字）。建册与单据映射接口按三期文档接线；请先在相册中手工建册，或等待完整 API。',
      })
      wx.showToast({ title: '已记录（骨架）', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },
})
