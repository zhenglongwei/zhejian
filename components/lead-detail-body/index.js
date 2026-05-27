Component({
  properties: {
    title: {
      type: String,
      value: '',
    },
    status: {
      type: String,
      value: '',
    },
    statusLabel: {
      type: String,
      value: '',
    },
    detailRows: {
      type: Array,
      value: [],
    },
    description: {
      type: String,
      value: '',
    },
    images: {
      type: Array,
      value: [],
    },
    imageComplianceType: {
      type: String,
      value: 'consultImage',
    },
    footerComplianceType: {
      type: String,
      value: 'consultRecord',
    },
    showFooter: {
      type: Boolean,
      value: true,
    },
  },
})
