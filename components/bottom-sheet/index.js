Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    title: {
      type: String,
      value: '',
    },
    hint: {
      type: String,
      value: '',
    },
    showTextarea: {
      type: Boolean,
      value: false,
    },
    textareaValue: {
      type: String,
      value: '',
    },
    textareaPlaceholder: {
      type: String,
      value: '',
    },
    maxlength: {
      type: Number,
      value: 200,
    },
    confirmText: {
      type: String,
      value: '确认',
    },
    cancelText: {
      type: String,
      value: '取消',
    },
    confirmDisabled: {
      type: Boolean,
      value: false,
    },
    loading: {
      type: Boolean,
      value: false,
    },
    showActions: {
      type: Boolean,
      value: true,
    },
    scrollable: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    noop() {},

    onMaskTap() {
      this.triggerEvent('close')
    },

    onCancel() {
      this.triggerEvent('cancel')
    },

    onConfirm() {
      if (this.properties.confirmDisabled || this.properties.loading) return
      this.triggerEvent('confirm')
    },

    onInput(e) {
      this.triggerEvent('input', { value: e.detail.value || '' })
    },
  },
})
