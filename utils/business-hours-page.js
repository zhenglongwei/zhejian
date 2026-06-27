const {
  formatBusinessHours,
  createEmptyClosureDraft,
  validateClosureDraft,
  sortClosures,
  enrichClosuresForDisplay,
} = require('./business-hours')

function createBusinessHoursPageHandlers() {
  return {
    syncBusinessHours() {
      const text = formatBusinessHours({
        daily: this.data.businessHoursDaily,
        temporaryClosures: this.data.businessHoursClosures,
      })
      this.setData({
        'form.businessHours': text,
        businessHoursPreview: text,
      })
    },

    onDailyTimeChange(e) {
      const { field } = e.currentTarget.dataset
      this.setData({
        [`businessHoursDaily.${field}`]: e.detail.value,
      })
      this.syncBusinessHours()
    },

    onToggleClosureForm() {
      this.setData({
        showClosureForm: !this.data.showClosureForm,
        closureDraft: createEmptyClosureDraft(),
      })
    },

    onClosureDraftDateChange(e) {
      const { field } = e.currentTarget.dataset
      this.setData({
        [`closureDraft.${field}`]: e.detail.value,
      })
    },

    onClosureDraftNoteInput(e) {
      this.setData({
        'closureDraft.note': e.detail.value,
      })
    },

    onConfirmClosure() {
      const draft = this.data.closureDraft || {}
      const message = validateClosureDraft(draft)
      if (message) {
        wx.showToast({ title: message, icon: 'none' })
        return
      }

      const next = enrichClosuresForDisplay(sortClosures((this.data.businessHoursClosures || []).concat([{
        id: `${draft.startDate}_${draft.endDate}_${Date.now()}`,
        startDate: draft.startDate,
        endDate: draft.endDate,
        note: String(draft.note || '').trim(),
      }])))

      this.setData({
        businessHoursClosures: next,
        showClosureForm: false,
        closureDraft: createEmptyClosureDraft(),
      })
      this.syncBusinessHours()
    },

    onCancelClosureForm() {
      this.setData({
        showClosureForm: false,
        closureDraft: createEmptyClosureDraft(),
      })
    },

    onRemoveClosure(e) {
      const { id } = e.currentTarget.dataset
      const next = (this.data.businessHoursClosures || []).filter((item) => item.id !== id)
      this.setData({ businessHoursClosures: next })
      this.syncBusinessHours()
    },
  }
}

module.exports = {
  createBusinessHoursPageHandlers,
}
