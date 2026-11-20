function money(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  const rounded = Math.round(n * 100) / 100
  const fixed = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2)
  const parts = fixed.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

function buildSummary(chapters) {
  const list = Array.isArray(chapters) ? chapters : []
  let quoteSum = 0
  let findingsCount = 0
  let workCount = 0
  let warranty = ''
  list.forEach((ch) => {
    if (!ch) return
    const isWork = ch.kind === 'work'
    ;(Array.isArray(ch.findings) ? ch.findings : []).forEach(() => {
      findingsCount += 1
    })
    ;(Array.isArray(ch.items) ? ch.items : []).forEach((row) => {
      if (!row) return
      if (isWork) workCount += 1
      const amount = Number(row.amount)
      if (Number.isFinite(amount) && amount > 0) quoteSum += amount
    })
    if (!warranty) {
      const period = String(ch.warrantyPeriod || '').trim()
      const notes = String(ch.warrantyNotes || '').trim()
      if (period || notes) warranty = [period, notes].filter(Boolean).join(' · ')
    }
  })
  const total = money(quoteSum)
  const stats = []
  if (total) stats.push({ label: '报价合计', value: `¥${total}`, tone: 'primary' })
  if (findingsCount) stats.push({ label: '检测项目', value: String(findingsCount), tone: 'primary' })
  if (workCount) stats.push({ label: '施工项目', value: String(workCount), tone: 'success' })
  if (warranty) stats.push({ label: '质保期限', value: warranty, tone: 'plain' })
  return stats.length ? { stats } : null
}

Component({
  properties: {
    chapters: {
      type: Array,
      value: [],
    },
    /** preview | edit */
    imageTapMode: {
      type: String,
      value: 'preview',
    },
  },

  data: {
    summary: null,
  },

  observers: {
    chapters(chapters) {
      this.setData({ summary: buildSummary(chapters) })
    },
  },

  methods: {
    onImageTap(e) {
      const url = String((e.currentTarget.dataset && e.currentTarget.dataset.url) || '').trim()
      if (!url) return
      if (this.data.imageTapMode === 'edit') {
        this.triggerEvent('imageedit', { url })
        return
      }
      const urls = (e.currentTarget.dataset && e.currentTarget.dataset.urls) || [url]
      const list = (Array.isArray(urls) ? urls : [url])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
      wx.previewImage({
        current: url,
        urls: list.length ? list : [url],
      })
    },
  },
})
