Component({
  properties: {
    image: { type: String, value: '' },
    title: { type: String, value: '暂无内容' },
    description: { type: String, value: '' },
    actionText: { type: String, value: '' },
    /** default 通用 · album 工具相册（空档案册相框占位） */
    theme: {
      type: String,
      value: 'default',
    },
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    },
  },
})
