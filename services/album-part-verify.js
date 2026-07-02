const { ENV } = require('./config')
const { get, post } = require('./request')
const { PART_TYPE } = require('../constants/part-type')
const { PART_VERIFY_CONSENT_TEXT, PART_VERIFY_ONSITE_REMINDER } = require('../constants/album-review')
const {
  buildPartVerifyPairs,
  normalizeAlbumParts,
} = require('../utils/album-part-pairs')

function useApi() {
  return ENV.mode !== 'mock'
}

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms))
}

function buildMockPairsContext(albumId) {
  const planParts = [
    {
      planPartId: 'plan_headlight',
      name: '左前大灯总成',
      partType: PART_TYPE.BRAND,
      partBrand: '海拉',
      partCode: 'HL-63117182518',
      qty: 1,
      status: 'confirmed',
    },
  ]
  const albumParts = normalizeAlbumParts([
    {
      partId: 'part_headlight_001',
      planPartId: 'plan_headlight',
      partName: '左前大灯总成',
      partBrand: '海拉',
      partType: PART_TYPE.BRAND,
      partCode: 'HL-63117182518',
      qty: 1,
      source: 'plan_linked',
      photos: ['mock://part-verify/headlight'],
    },
    {
      partId: 'part_extra_001',
      partName: '灯泡补充包',
      partType: PART_TYPE.AFTERMARKET,
      partBrand: '欧司朗',
      partCode: 'H7-55W',
      qty: 1,
      source: 'extra',
      photos: [],
    },
  ])
  const { pairs, extras } = buildPartVerifyPairs(planParts, albumParts)
  return {
    albumId,
    albumTitle: '左前大灯更换',
    storeName: '辙见演示门店',
    storePhone: '400-000-0000',
    hasParts: true,
    hasStructuredPlanParts: true,
    planSummary: '更换左前大灯总成，含灯泡检测与安装调试。',
    planQuoteThumbs: ['mock://part-verify/quote-table'],
    pairs: pairs.map((entry) => ({
      ...entry,
      verification: { status: 'skipped', note: '', images: [] },
    })),
    extras: extras.map((entry) => ({
      ...entry,
      verification: { status: 'skipped', note: '', images: [] },
    })),
    parts: albumParts.map((part) => ({
      ...part,
      verification: { status: 'skipped', note: '', images: [] },
    })),
    summary: { total: 2, matched: 0, question: 0, pending: 2, label: '2 项待验真' },
    consentText: PART_VERIFY_CONSENT_TEXT,
    onsiteReminder: PART_VERIFY_ONSITE_REMINDER,
  }
}

async function fetchAlbumPartVerifyContext(albumId) {
  if (useApi()) {
    return get(`/user/service-albums/${albumId}/part-verifications`)
  }
  await delay()
  if (albumId === 'alb_svc_pending_confirm') {
    return buildMockPairsContext(albumId)
  }
  return {
    albumId,
    albumTitle: '我的服务相册',
    storeName: '',
    storePhone: '',
    hasParts: false,
    parts: [],
    pairs: [],
    extras: [],
    summary: { total: 0, label: '' },
    planSummary: '',
    planQuoteThumbs: [],
    hasStructuredPlanParts: false,
    onsiteReminder: PART_VERIFY_ONSITE_REMINDER,
    consentText: PART_VERIFY_CONSENT_TEXT,
  }
}

async function saveAlbumPartVerifications(albumId, payload = {}) {
  if (useApi()) {
    return post(`/user/service-albums/${albumId}/part-verifications`, payload)
  }
  await delay()
  return { albumId, summary: { label: '已保存' } }
}

module.exports = {
  fetchAlbumPartVerifyContext,
  saveAlbumPartVerifications,
}
