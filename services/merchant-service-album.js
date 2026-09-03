/**
 * V2.0 商家服务相册 — API: /api/merchant/service-albums/*
 */
const { ENV } = require('./config')
const { get, post, put, patch } = require('./request')
const { getProfile } = require('./merchant')
const { getSession } = require('../utils/auth')
const {
  mockFetchMerchantServiceAlbumList,
  mockFetchMerchantServiceAlbum,
  mockCreateMerchantServiceAlbum,
  mockSaveMerchantServiceAlbum,
  mockCompleteMerchantServiceAlbum,
  mockFetchMerchantAlbumStats,
} = require('../mock/service-albums')

function resolveStoreId() {
  const session = getSession()
  if (session.merchant && session.merchant.storeId) {
    return session.merchant.storeId
  }
  const profile = getProfile()
  return (profile && profile.storeId) || ''
}

function withStore(params = {}) {
  const storeId = resolveStoreId()
  if (!storeId) return params
  return { ...params, storeId }
}

async function fetchMerchantServiceAlbumList(options = {}) {
  if (ENV.mode === 'mock') {
    return mockFetchMerchantServiceAlbumList(options)
  }
  return get('/merchant/service-albums', withStore(options))
}

async function fetchMerchantServiceAlbum(albumId) {
  if (ENV.mode === 'mock') {
    return mockFetchMerchantServiceAlbum(albumId)
  }
  return get(`/merchant/service-albums/${albumId}`, withStore())
}

async function createMerchantServiceAlbum(payload) {
  if (ENV.mode === 'mock') {
    return mockCreateMerchantServiceAlbum(payload)
  }
  return post('/merchant/service-albums', withStore(payload))
}

async function saveMerchantServiceAlbum(albumId, payload) {
  if (ENV.mode === 'mock') {
    return mockSaveMerchantServiceAlbum(albumId, payload)
  }
  return post(`/merchant/service-albums/${albumId}`, withStore(payload))
}

async function completeMerchantServiceAlbum(albumId) {
  if (ENV.mode === 'mock') {
    return mockCompleteMerchantServiceAlbum(albumId)
  }
  return post(`/merchant/service-albums/${albumId}/complete`, withStore())
}

async function fetchMerchantAlbumStats() {
  if (ENV.mode === 'mock') {
    return mockFetchMerchantAlbumStats()
  }
  return get('/merchant/service-albums/stats', withStore())
}

async function fetchMerchantAlbumGeoPreview(albumId) {
  if (ENV.mode === 'mock') {
    const { mockFetchMerchantAlbumGeoPreview } = require('../mock/service-albums')
    return mockFetchMerchantAlbumGeoPreview(albumId)
  }
  return get(`/merchant/service-albums/${albumId}/geo-preview`, withStore())
}

async function createMerchantColdStartPreview(albumId) {
  if (ENV.mode === 'mock') {
    const { mockCreateMerchantColdStartPreview } = require('../mock/service-albums')
    return mockCreateMerchantColdStartPreview(albumId)
  }
  return post(`/merchant/service-albums/${albumId}/cold-start-preview`, withStore())
}

async function fetchMerchantAlbumClaimQrcode(albumId) {
  if (ENV.mode === 'mock') {
    const { mockFetchMerchantAlbumClaimQrcode } = require('../mock/service-albums')
    return mockFetchMerchantAlbumClaimQrcode(albumId)
  }
  return get(`/merchant/service-albums/${albumId}/claim-qrcode`, withStore())
}

async function submitMerchantPublicCase(albumId, payload = {}) {
  if (ENV.mode === 'mock') {
    const { mockSubmitMerchantPublicCase } = require('../mock/service-albums')
    return mockSubmitMerchantPublicCase(albumId, payload)
  }
  return post(`/merchant/service-albums/${albumId}/public-case`, withStore(payload))
}

async function fetchMerchantAlbumContentOptimize(albumId) {
  return get(`/merchant/service-albums/${albumId}/content-optimize`, withStore())
}

async function generateMerchantAlbumContentOptimize(albumId) {
  return post(`/merchant/service-albums/${albumId}/content-optimize/generate`, withStore())
}

async function applyMerchantAlbumContentOptimize(albumId) {
  return post(`/merchant/service-albums/${albumId}/content-optimize/apply`, withStore())
}

async function fetchMerchantCaseDraft(albumId) {
  return get(`/merchant/service-albums/${albumId}/case-draft`, withStore())
}

async function fetchMerchantCaseDraftMaskStatus(albumId, options = {}) {
  return get(
    `/merchant/service-albums/${albumId}/case-draft/pre-mask`,
    withStore({ retry: options.retry ? 1 : undefined }),
  )
}

async function saveMerchantCaseDraft(albumId, payload = {}) {
  return put(`/merchant/service-albums/${albumId}/case-draft`, withStore(payload))
}

async function polishMerchantCaseDraft(albumId, payload = {}) {
  return post(`/merchant/service-albums/${albumId}/case-draft/ai-polish`, withStore(payload), {
    timeout: 60000,
  })
}

/** PUB-GEO · 主题卡按需 AI 对照 */
async function interpretMerchantAlbumVision(albumId, payload = {}) {
  return post(`/merchant/service-albums/${albumId}/vision/interpret`, withStore(payload), {
    timeout: 120000,
  })
}

async function confirmAndCompleteMerchantCaseDraft(albumId, payload = {}) {
  return post(
    `/merchant/service-albums/${albumId}/case-draft/confirm-and-complete`,
    withStore(payload),
  )
}

async function exportMerchantCaseDraftCopy(albumId) {
  return get(`/merchant/service-albums/${albumId}/case-draft/export-copy`, withStore())
}

async function generateMerchantPublicCase(albumId, payload = {}) {
  return post(`/merchant/service-albums/${albumId}/generate-case`, withStore(payload), {
    timeout: 180000,
  })
}

/** PUB-GEO · 机审过线后确认发布到店页 */
async function confirmMerchantPublicCasePublish(albumId, payload = {}) {
  return post(`/merchant/service-albums/${albumId}/confirm-publish-case`, withStore(payload), {
    timeout: 120000,
  })
}

async function hostMerchantAlbum(albumId) {
  return post(`/merchant/service-albums/${albumId}/host`, withStore())
}

async function unhostMerchantAlbum(albumId) {
  return post(`/merchant/service-albums/${albumId}/unhost`, withStore())
}

async function unpublishHostedMerchantAlbum(albumId) {
  return post(`/merchant/service-albums/${albumId}/unpublish-hosted`, withStore())
}

async function saveHostedPublicCopy(albumId, payload = {}) {
  return put(`/merchant/service-albums/${albumId}/host-public-copy`, withStore(payload))
}

async function fetchHostedCases() {
  return get('/merchant/hosted-cases', withStore())
}

async function updateMerchantAlbumNotifyPhone(albumId, phone) {
  return patch(`/merchant/service-albums/${albumId}/notify-phone`, withStore({ phone }))
}

async function resendMerchantCaseNotify(albumId) {
  return post(`/merchant/service-albums/${albumId}/resend-notify`, withStore())
}

async function switchMerchantServiceAlbumTemplate(albumId, templateId) {
  if (ENV.mode === 'mock') {
    const { mockSwitchMerchantServiceAlbumTemplate } = require('../mock/service-albums')
    return mockSwitchMerchantServiceAlbumTemplate(albumId, templateId)
  }
  return post(`/merchant/service-albums/${albumId}/switch-template`, withStore({ templateId }))
}

async function recognizeVehicleIntakeOcr(imageUrl, options = {}) {
  const mode = options.mode || options.prefer || ''
  if (ENV.mode === 'mock') {
    const { mockRecognizeVehicleIntakeOcr } = require('../mock/service-albums')
    return mockRecognizeVehicleIntakeOcr(imageUrl, { mode })
  }
  return post('/merchant/service-albums/vehicle-ocr', {
    imageUrl,
    ...(mode ? { mode } : {}),
  })
}

/** ALB-UX-02 · VIN 解码 */
async function decodeMerchantVin(vin) {
  if (ENV.mode === 'mock') {
    return {
      vin: String(vin || '').toUpperCase(),
      vehicle: {
        vin: String(vin || '').toUpperCase(),
        brand: '示例品牌',
        series: '示例车系',
        modelYear: '2020',
        vinDecodedAt: new Date().toISOString(),
      },
    }
  }
  return post('/merchant/service-albums/vin-decode', { vin })
}

module.exports = {
  fetchMerchantServiceAlbumList,
  fetchMerchantServiceAlbum,
  createMerchantServiceAlbum,
  saveMerchantServiceAlbum,
  completeMerchantServiceAlbum,
  fetchMerchantAlbumStats,
  fetchMerchantAlbumGeoPreview,
  fetchMerchantAlbumContentOptimize,
  generateMerchantAlbumContentOptimize,
  applyMerchantAlbumContentOptimize,
  fetchMerchantCaseDraft,
  fetchMerchantCaseDraftMaskStatus,
  saveMerchantCaseDraft,
  polishMerchantCaseDraft,
  interpretMerchantAlbumVision,
  confirmAndCompleteMerchantCaseDraft,
  exportMerchantCaseDraftCopy,
  generateMerchantPublicCase,
  confirmMerchantPublicCasePublish,
  hostMerchantAlbum,
  unhostMerchantAlbum,
  unpublishHostedMerchantAlbum,
  saveHostedPublicCopy,
  fetchHostedCases,
  updateMerchantAlbumNotifyPhone,
  resendMerchantCaseNotify,
  createMerchantColdStartPreview,
  submitMerchantPublicCase,
  fetchMerchantAlbumClaimQrcode,
  switchMerchantServiceAlbumTemplate,
  recognizeVehicleIntakeOcr,
  decodeMerchantVin,
}
