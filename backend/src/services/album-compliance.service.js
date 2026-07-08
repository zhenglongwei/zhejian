/**
 * CASE-GATE-A-02 · 相册完工合规自动规则 + 抽检
 */
const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const {
  ALBUM_COMPLIANCE_STATUS,
  ALBUM_COMPLIANCE_REVIEW_MODE,
  ALBUM_COMPLIANCE_VIOLATION,
  ALBUM_COMPLIANCE_BANNED_PHRASES,
  EXTERNAL_CONTACT_PATTERNS,
} = require('../constants/album-compliance')
const { SERVICE_ALBUM_STATUS } = require('../constants/v2')

async function fetchAlbumForCompliance(albumId) {
  return prisma.album.findUnique({
    where: { id: albumId },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
      authorization: true,
      publicCase: true,
    },
  })
}

function normalizeSpotCheckRate(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0.1
  return Math.min(1, Math.max(0, n))
}

function collectAlbumComplianceTexts(album) {
  const chunks = [
    album.serviceName,
    album.storeNote,
    album.storeName,
  ]
  ;(album.nodes || []).forEach((node) => {
    chunks.push(node.title, node.note)
  })
  return chunks.map((item) => String(item || '').trim()).filter(Boolean)
}

function scanBannedPhrases(texts) {
  const hits = []
  for (const text of texts) {
    for (const phrase of ALBUM_COMPLIANCE_BANNED_PHRASES) {
      if (text.includes(phrase)) {
        hits.push({
          type: ALBUM_COMPLIANCE_VIOLATION.BANNED_PHRASE,
          phrase,
          excerpt: text.slice(0, 120),
        })
      }
    }
  }
  return hits
}

function scanExternalContacts(texts) {
  const hits = []
  for (const text of texts) {
    for (const pattern of EXTERNAL_CONTACT_PATTERNS) {
      const match = text.match(pattern.re)
      if (match) {
        hits.push({
          type: pattern.type,
          match: match[0],
          excerpt: text.slice(0, 120),
        })
      }
    }
  }
  return hits
}

/**
 * @param {object} album prisma album with nodes
 * @returns {{ passed: boolean, violations: object[], summary: string }}
 */
function evaluateAlbumComplianceRules(album) {
  const texts = collectAlbumComplianceTexts(album)
  const violations = [...scanBannedPhrases(texts), ...scanExternalContacts(texts)]
  if (!violations.length) {
    return { passed: true, violations: [], summary: '' }
  }
  const summary = violations
    .slice(0, 3)
    .map((item) => {
      if (item.type === ALBUM_COMPLIANCE_VIOLATION.BANNED_PHRASE) {
        return `含违规表述「${item.phrase}」`
      }
      if (item.type === ALBUM_COMPLIANCE_VIOLATION.EXTERNAL_WECHAT) {
        return '含外部微信导流信息'
      }
      return '含外部联系方式'
    })
    .join('；')
  return { passed: false, violations, summary }
}

function shouldSpotCheckAlbum(albumId) {
  const rate = normalizeSpotCheckRate(
    config.albumCompliance?.spotCheckRate ?? process.env.ALBUM_COMPLIANCE_SPOT_CHECK_RATE
  )
  if (rate <= 0) return false
  let hash = 0
  const key = String(albumId || '')
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  const bucket = (hash % 10000) / 10000
  return bucket < rate
}

function buildRejectReasonFromEvaluation(evaluation) {
  return evaluation.summary || '留档内容未通过合规审查，请修改后重新提交'
}

function isAlbumCompliancePassed(album) {
  return album?.complianceStatus === ALBUM_COMPLIANCE_STATUS.PASSED
}

function assertAlbumCompliancePassed(album) {
  if (isAlbumCompliancePassed(album)) return
  const status = album?.complianceStatus || ALBUM_COMPLIANCE_STATUS.NONE
  if (status === ALBUM_COMPLIANCE_STATUS.SPOT_CHECK || status === ALBUM_COMPLIANCE_STATUS.PENDING) {
    const err = new Error('门店留档合规审核中，通过后可授权公示')
    err.status = 409
    err.code = 'ALBUM_COMPLIANCE_PENDING'
    throw err
  }
  if (status === ALBUM_COMPLIANCE_STATUS.REJECTED) {
    const err = new Error(album.complianceRejectReason || '门店留档合规未通过，请门店修改后重新提交')
    err.status = 409
    err.code = 'ALBUM_COMPLIANCE_REJECTED'
    throw err
  }
  const err = new Error('门店尚未完成留档合规审查')
  err.status = 409
  err.code = 'ALBUM_COMPLIANCE_REQUIRED'
  throw err
}

/**
 * @param {string} albumId
 * @param {{ forceSpotCheck?: boolean }} [options]
 */
async function runAlbumComplianceGate(albumId, options = {}) {
  const album = await fetchAlbumForCompliance(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  if (album.status !== SERVICE_ALBUM_STATUS.COMPLETED && album.status !== 'published') {
    const err = new Error('相册尚未完工，无法执行合规审查')
    err.status = 409
    throw err
  }

  const evaluation = evaluateAlbumComplianceRules(album)
  const now = new Date()

  if (!evaluation.passed) {
    await prisma.album.update({
      where: { id: albumId },
      data: {
        complianceStatus: ALBUM_COMPLIANCE_STATUS.REJECTED,
        compliancePassedAt: null,
        complianceRejectReason: buildRejectReasonFromEvaluation(evaluation),
        complianceReviewMode: ALBUM_COMPLIANCE_REVIEW_MODE.AUTO,
        complianceCheckedAt: now,
      },
    })
    return {
      albumId,
      complianceStatus: ALBUM_COMPLIANCE_STATUS.REJECTED,
      passed: false,
      reviewMode: ALBUM_COMPLIANCE_REVIEW_MODE.AUTO,
      rejectReason: buildRejectReasonFromEvaluation(evaluation),
      violations: evaluation.violations,
    }
  }

  const spotCheck = options.forceSpotCheck || shouldSpotCheckAlbum(albumId)
  if (spotCheck) {
    await prisma.album.update({
      where: { id: albumId },
      data: {
        complianceStatus: ALBUM_COMPLIANCE_STATUS.SPOT_CHECK,
        compliancePassedAt: null,
        complianceRejectReason: '',
        complianceReviewMode: ALBUM_COMPLIANCE_REVIEW_MODE.SPOT_CHECK,
        complianceCheckedAt: now,
      },
    })
    return {
      albumId,
      complianceStatus: ALBUM_COMPLIANCE_STATUS.SPOT_CHECK,
      passed: false,
      reviewMode: ALBUM_COMPLIANCE_REVIEW_MODE.SPOT_CHECK,
      spotCheck: true,
    }
  }

  await prisma.album.update({
    where: { id: albumId },
    data: {
      complianceStatus: ALBUM_COMPLIANCE_STATUS.PASSED,
      compliancePassedAt: now,
      complianceRejectReason: '',
      complianceReviewMode: ALBUM_COMPLIANCE_REVIEW_MODE.AUTO,
      complianceCheckedAt: now,
    },
  })
  return {
    albumId,
    complianceStatus: ALBUM_COMPLIANCE_STATUS.PASSED,
    passed: true,
    reviewMode: ALBUM_COMPLIANCE_REVIEW_MODE.AUTO,
  }
}

async function resubmitAlbumCompliance(albumId, storeId, merchantId = '') {
  const album = await fetchAlbumForCompliance(albumId)
  if (!album) {
    const err = new Error('档案不存在或已被删除')
    err.status = 404
    throw err
  }
  const allowed =
    (merchantId && album.merchantId === merchantId) ||
    (storeId && album.storeId === storeId)
  if (!allowed) {
    const err = new Error('档案不存在或已被删除')
    err.status = 404
    throw err
  }
  if (album.status !== SERVICE_ALBUM_STATUS.COMPLETED && album.status !== 'published') {
    const err = new Error('请先标记服务相册已完工')
    err.status = 409
    throw err
  }
  await prisma.album.update({
    where: { id: albumId },
    data: {
      complianceStatus: ALBUM_COMPLIANCE_STATUS.PENDING,
      complianceRejectReason: '',
    },
  })
  return runAlbumComplianceGate(albumId)
}

module.exports = {
  evaluateAlbumComplianceRules,
  runAlbumComplianceGate,
  resubmitAlbumCompliance,
  isAlbumCompliancePassed,
  assertAlbumCompliancePassed,
  collectAlbumComplianceTexts,
  shouldSpotCheckAlbum,
}
