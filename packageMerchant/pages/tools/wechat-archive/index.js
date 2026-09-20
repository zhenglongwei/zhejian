const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')
const {
  createMerchantAlbumFromWechat,
  attachMerchantWechatPhotos,
} = require('../../../../services/merchant-service-album')
const { uploadImage } = require('../../../../utils/media-upload')
const {
  consumeWechatArchiveIntent,
  redirectToWorkbenchForArchive,
} = require('../../../../utils/wechat-archive-intent')

const TARGET_ORDER = ['intake', 'work', 'delivery']
const TARGET_LABEL = {
  intake: '检查',
  work: '施工',
  delivery: '完工',
  unassigned: '未分类',
}

function countToken(text, token) {
  const matches = String(text || '').match(new RegExp(`\\[${token}\\]`, 'g'))
  return matches ? matches.length : 0
}

function decorateSlots(slots = []) {
  return (slots || []).map((row, index) => ({
    key: row.key || `slot-${index}`,
    label: TARGET_LABEL[row.target] || row.label || '未分类',
    target: row.target || 'unassigned',
    say: row.say || '',
    localPath: row.localPath || '',
    url: row.url || '',
  }))
}

Page({
  data: {
    step: 'paste',
    chatText: '',
    mediaHint: '',
    loading: false,
    attaching: false,
    errorMessage: '',
    albumId: '',
    preview: {},
    slots: [],
    hasLocalPhotos: false,
  },

  onLoad() {
    this.ensureMerchant()
  },

  async ensureMerchant() {
    try {
      const profile = await fetchMerchantProfile()
      if (profile && profile.status === MERCHANT_STATUS.APPROVED) {
        consumeWechatArchiveIntent()
        return
      }
      redirectToWorkbenchForArchive()
    } catch (e) {
      /* 网络失败留在本页，生成时报错 */
    }
  },

  onInput(e) {
    const chatText = (e.detail && e.detail.value) || ''
    const images = countToken(chatText, '图片')
    const voices = countToken(chatText, '语音')
    let mediaHint = ''
    if (images) mediaHint = `群里有 ${images} 张图，下一步一次选进`
    if (voices) {
      mediaHint = mediaHint
        ? `${mediaHint}；${voices} 条语音需先转成文字`
        : `${voices} 条语音需先转成文字再贴进来`
    }
    this.setData({ chatText, mediaHint })
  },

  onRetry() {
    this.setData({ step: 'paste', errorMessage: '' })
  },

  async onGenerate() {
    const text = String(this.data.chatText || '').trim()
    if (!text) {
      wx.showToast({ title: '请先粘贴群聊文字', icon: 'none' })
      return
    }
    if (this.data.loading) return
    this.setData({ loading: true, errorMessage: '' })
    try {
      const data = await createMerchantAlbumFromWechat({ text })
      const slots = decorateSlots(data.photoSlots)
      this.setData({
        loading: false,
        step: 'preview',
        albumId: data.albumId,
        slots,
        hasLocalPhotos: false,
        preview: {
          vehicleLabel: data.vehicleLabel || '该车辆',
          chiefComplaint: data.chiefComplaint || '',
          findingsText: (data.findings || []).filter(Boolean).join('、'),
          plan: data.plan || '',
          amountLabel: data.amount ? '方案已带金额，仅本单可见' : '',
          voiceHint:
            Number(data.voiceCount) > 0
              ? `还有 ${data.voiceCount} 条语音没转成文字`
              : '',
        },
      })
    } catch (err) {
      this.setData({
        loading: false,
        step: 'error',
        errorMessage: (err && err.message) || '请稍后重试',
      })
    }
  },

  fillSlotsWithPaths(paths) {
    const slots = this.data.slots.slice()
    const queue = (paths || []).filter(Boolean)
    slots.forEach((slot, index) => {
      if (!queue.length) return
      if (slot.localPath || slot.url) return
      slots[index] = { ...slot, localPath: queue.shift() }
    })
    queue.forEach((path, extraIndex) => {
      slots.push({
        key: `extra-${Date.now()}-${extraIndex}`,
        label: '未分类',
        target: 'unassigned',
        say: '',
        localPath: path,
        url: '',
      })
    })
    this.setData({
      slots,
      hasLocalPhotos: slots.some((row) => row.localPath),
    })
  },

  chooseImages(count, onPick) {
    const run = (api, fallback) => {
      api({
        count,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const paths = (res.tempFiles || []).map((f) => f.tempFilePath).filter(Boolean)
          if (paths.length) onPick(paths)
        },
        fail: (err) => {
          const msg = String((err && err.errMsg) || '')
          if (/cancel/i.test(msg)) return
          if (fallback) fallback()
          else wx.showToast({ title: '无法打开相册', icon: 'none' })
        },
      })
    }
    if (typeof wx.chooseMedia === 'function') {
      run(wx.chooseMedia, () =>
        wx.chooseImage({
          count,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: (res) => onPick(res.tempFilePaths || []),
          fail: () => wx.showToast({ title: '无法打开相册', icon: 'none' }),
        }),
      )
      return
    }
    wx.chooseImage({
      count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => onPick(res.tempFilePaths || []),
      fail: () => wx.showToast({ title: '无法打开相册', icon: 'none' }),
    })
  },

  onPickBatch() {
    this.chooseImages(9, (paths) => this.fillSlotsWithPaths(paths))
  },

  onPickOne(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    this.chooseImages(1, (paths) => {
      const path = paths[0]
      if (!path) return
      const slots = this.data.slots.slice()
      slots[index] = { ...slots[index], localPath: path }
      this.setData({
        slots,
        hasLocalPhotos: slots.some((row) => row.localPath),
      })
    })
  },

  onCycleTarget(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const slots = this.data.slots.slice()
    const current = slots[index]
    const pos = TARGET_ORDER.indexOf(current.target)
    const next = TARGET_ORDER[(pos + 1) % TARGET_ORDER.length]
    slots[index] = {
      ...current,
      target: next,
      label: TARGET_LABEL[next],
    }
    this.setData({ slots })
  },

  goFlow() {
    const albumId = this.data.albumId
    if (!albumId) return
    wx.redirectTo({
      url: `/packageMerchant/pages/album/flow/index?albumId=${albumId}`,
    })
  },

  async onConfirmPhotos() {
    if (this.data.attaching) return
    const slots = this.data.slots || []
    const pending = slots.filter((row) => row.localPath && row.target !== 'unassigned')
    if (!pending.length) {
      this.goFlow()
      return
    }
    this.setData({ attaching: true })
    try {
      const assignments = []
      for (let i = 0; i < pending.length; i += 1) {
        const uploaded = await uploadImage(pending[i].localPath)
        const url = uploaded && (uploaded.url || uploaded)
        if (!url) continue
        assignments.push({
          target: pending[i].target,
          url,
          caption: pending[i].say || pending[i].label || '',
        })
      }
      if (assignments.length) {
        await attachMerchantWechatPhotos(this.data.albumId, assignments)
      }
      this.setData({ attaching: false })
      this.goFlow()
    } catch (err) {
      this.setData({ attaching: false })
      wx.showToast({ title: (err && err.message) || '照片未挂上', icon: 'none' })
    }
  },
})
