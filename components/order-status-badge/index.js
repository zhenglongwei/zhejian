const {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
} = require('../../constants/order-status')

const TONE_CLASS = {
  warning: 'order-status-badge--warning',
  primary: 'order-status-badge--primary',
  success: 'order-status-badge--success',
  danger: 'order-status-badge--danger',
}

Component({
  properties: {
    status: {
      type: String,
      value: '',
    },
    size: {
      type: String,
      value: 'sm',
    },
    label: {
      type: String,
      value: '',
    },
  },
  data: {
    displayLabel: '',
    toneClass: '',
    sizeClass: 'order-status-badge--sm',
  },
  observers: {
    'status, label'() {
      this.syncPresentation()
    },
    size(s) {
      this.setData({
        sizeClass: s === 'lg' ? 'order-status-badge--lg' : 'order-status-badge--sm',
      })
    },
  },
  lifetimes: {
    attached() {
      this.setData({
        sizeClass:
          this.properties.size === 'lg'
            ? 'order-status-badge--lg'
            : 'order-status-badge--sm',
      })
      this.syncPresentation()
    },
  },
  methods: {
    syncPresentation() {
      const { status, label } = this.properties
      const tone = ORDER_STATUS_TONE[status] || 'warning'
      this.setData({
        displayLabel: label || ORDER_STATUS_LABEL[status] || '—',
        toneClass: TONE_CLASS[tone] || TONE_CLASS.warning,
      })
    },
  },
})
