const { fetchMerchantProfile, MERCHANT_STATUS } = require('../../../services/merchant')
const {
  fetchMerchantServiceAlbumList,
  fetchMerchantAlbumFlow,
  updateMerchantFlowNode,
} = require('../../../services/merchant-service-album')
const { SERVICE_ALBUM_REPAIR_DONE_STATUSES } = require('../../../constants/service-album-status')
const { collectAssistantAdvice } = require('../../../utils/merchant-assistant-advice')

function inProgress(item) {
  if (!item || !item.albumId) return false
  if (item.hubCard && item.hubCard.repairDone) return false
  return !SERVICE_ALBUM_REPAIR_DONE_STATUSES.includes(item.status)
}

function stamp(item) {
  const hub = (item && item.hubCard) || {}
  const at = Date.parse(hub.updatedAt || item.updatedAt || '')
  return Number.isFinite(at) ? at : 0
}

function namedLines(node) {
  const lines = node && node.document && node.document.payload && node.document.payload.lines
  return (Array.isArray(lines) ? lines : []).filter((line) => String((line && line.name) || '').trim())
}

Page({
  data: {
    status: 'loading',
    cards: [],
    albumCount: 0,
    errorMessage: '',
    statusBarHeight: 20,
    capsulePad: 16,
  },

  onLoad() {
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    let capsulePad = 16
    try {
      const menu = wx.getMenuButtonBoundingClientRect()
      if (menu && menu.left && sys.windowWidth) {
        capsulePad = Math.max(16, sys.windowWidth - menu.left + 8)
      }
    } catch (e) {
      capsulePad = 96
    }
    this.setData({
      statusBarHeight: sys.statusBarHeight || 20,
      capsulePad,
    })
  },

  onShow() {
    const silent = this.data.status === 'ready' || this.data.status === 'empty'
    this.loadAdvice({ silent })
  },

  async loadAdvice(options = {}) {
    if (this._loading) return
    this._loading = true
    if (!options.silent) this.setData({ status: 'loading', errorMessage: '' })
    try {
      const profile = await fetchMerchantProfile()
      if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
        this.setData({ status: 'empty', cards: [], albumCount: 0 })
        return
      }
      const raw = await fetchMerchantServiceAlbumList({ tab: 'all' })
      const active = (raw || [])
        .filter(inProgress)
        .sort((a, b) => stamp(b) - stamp(a))
        .slice(0, 12)
      const now = new Date()
      const groups = await Promise.all(
        active.map(async (item) => {
          try {
            const flow = await fetchMerchantAlbumFlow(item.albumId)
            return collectAssistantAdvice(
              { ...item, flowNodes: (flow && flow.flowNodes) || [] },
              now,
            )
          } catch (_) {
            return []
          }
        }),
      )
      const cards = groups.flat()
      const albumCount = new Set(cards.map((card) => card.albumId)).size
      this.setData({
        cards,
        albumCount,
        status: cards.length ? 'ready' : 'empty',
      })
    } catch (err) {
      this.setData({
        status: 'error',
        errorMessage: (err && err.message) || '加载失败',
      })
    } finally {
      this._loading = false
    }
  },

  onRetry() {
    this.loadAdvice()
  },

  openCard(card) {
    const albumId = encodeURIComponent(card.albumId)
    const nodeId = encodeURIComponent(String(card.nodeId || '').trim())
    wx.navigateTo({
      url: `/packageMerchant/pages/album/flow/index?albumId=${albumId}&nodeId=${nodeId}`,
    })
  },

  async onAction(e) {
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    const card = (this.data.cards || []).find((row) => row.id === id)
    if (!card || this._acting) return
    if (card.action !== 'quote') {
      this.openCard(card)
      return
    }
    this._acting = true
    try {
      const flow = await fetchMerchantAlbumFlow(card.albumId)
      const node = ((flow && flow.flowNodes) || []).find((row) => row && row.id === card.quoteNodeId)
      const status = String((node && node.document && node.document.status) || '')
      const locked = ['pending_confirm', 'confirmed', 'cancelled', 'delivered'].includes(status)
      if (!node || locked) {
        wx.showToast({ title: '报价已发给车主', icon: 'none' })
        this.openCard(card)
        return
      }
      const lines = namedLines(node)
      if (lines.some((line) => String(line.name || '').trim() === card.lineName)) {
        wx.showToast({ title: '报价单里已有', icon: 'none' })
        this.openCard({ ...card, nodeId: card.quoteNodeId })
        return
      }
      await updateMerchantFlowNode(card.albumId, card.quoteNodeId, {
        document: {
          status: 'draft',
          payload: {
            lines: lines.concat([{ name: card.lineName, amount: '', note: card.lineNote || '' }]),
          },
        },
      })
      wx.showToast({ title: '已写入报价单', icon: 'none' })
      this.openCard({ ...card, nodeId: card.quoteNodeId })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '未写入', icon: 'none' })
    } finally {
      this._acting = false
    }
  },
})
