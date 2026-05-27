Component({
  properties: {
    value: {
      type: String,
      value: '',
    },
    placeholder: {
      type: String,
      value: '搜索服务、门店、车型、故障或案例',
    },
    focus: {
      type: Boolean,
      value: false,
    },
    readonly: {
      type: Boolean,
      value: false,
    },
    showCancel: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    onReadonlyTap() {
      this.triggerEvent('navigate')
    },

    onInput(e) {
      this.triggerEvent('input', { value: e.detail.value })
    },

    onConfirm(e) {
      this.triggerEvent('confirm', { value: e.detail.value })
    },

    onClear() {
      this.triggerEvent('clear')
      this.triggerEvent('input', { value: '' })
    },

    onCancel() {
      this.triggerEvent('cancel')
    },
  },
})
