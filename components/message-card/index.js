Component({
  properties: {
    messageId: {
      type: String,
      value: '',
    },
    title: {
      type: String,
      value: '',
    },
    content: {
      type: String,
      value: '',
    },
    time: {
      type: String,
      value: '',
    },
    read: {
      type: Boolean,
      value: false,
    },
    jumpPath: {
      type: String,
      value: '',
    },
  },
  methods: {
    onTap() {
      const { messageId, jumpPath } = this.properties
      if (!messageId) return
      this.triggerEvent('tap', { id: messageId, path: jumpPath })
    },
  },
})
