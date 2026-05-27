const {
  LEAD_STATUS_LABEL,
  LEAD_STATUS_TONE,
} = require('../../constants/lead-status')

const TONE_CLASS = {
  warning: 'lead-status-badge--warning',
  primary: 'lead-status-badge--primary',
  success: 'lead-status-badge--success',
  danger: 'lead-status-badge--danger',
  info: 'lead-status-badge--info',
  muted: 'lead-status-badge--muted',
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
    sizeClass: 'lead-status-badge--sm',
  },
  observers: {
    'status, label'() {
      this.syncPresentation()
    },
    size(s) {
      this.setData({
        sizeClass: s === 'lg' ? 'lead-status-badge--lg' : 'lead-status-badge--sm',
      })
    },
  },
  lifetimes: {
    attached() {
      this.setData({
        sizeClass:
          this.properties.size === 'lg'
            ? 'lead-status-badge--lg'
            : 'lead-status-badge--sm',
      })
      this.syncPresentation()
    },
  },
  methods: {
    syncPresentation() {
      const { status, label } = this.properties
      const tone = LEAD_STATUS_TONE[status] || 'warning'
      this.setData({
        displayLabel: label || LEAD_STATUS_LABEL[status] || '—',
        toneClass: TONE_CLASS[tone] || TONE_CLASS.warning,
      })
    },
  },
})
