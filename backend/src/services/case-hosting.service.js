/**
 * 案例托管状态（15_案例档案与托管状态机 · 二期）
 * hostMeta 落在 album.contentPackageJson.hostMeta
 */

const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')

function readHostMeta(album) {
  const pkg =
    album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  const meta = pkg.hostMeta && typeof pkg.hostMeta === 'object' ? pkg.hostMeta : {}
  const published =
    album &&
    album.publicCase &&
    album.publicCase.status === PUBLIC_CASE_STATUS.PUBLISHED &&
    !album.publicCase.storefrontHidden &&
    !album.publicCase.ownerBlockedAt
  return {
    hosted: Boolean(meta.hosted) || published,
    visibility: published ? 'public' : meta.visibility === 'public' ? 'public' : 'private',
    authenticityCommitmentAt: meta.authenticityCommitmentAt || null,
    useDesensitizeTool: meta.useDesensitizeTool !== false,
    sourceLabel: meta.sourceLabel || '商家上传',
    overview: meta.overview || '',
    faq: Array.isArray(meta.faq) ? meta.faq : [],
    updatedAt: meta.updatedAt || null,
    revisions: Array.isArray(meta.revisions) ? meta.revisions : [],
    confirmedDocs: Array.isArray(meta.confirmedDocs) ? meta.confirmedDocs : [],
  }
}

async function writeHostMeta(albumId, patch) {
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  const pkg =
    album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? { ...album.contentPackageJson }
      : {}
  const prev = pkg.hostMeta && typeof pkg.hostMeta === 'object' ? { ...pkg.hostMeta } : {}
  const next = {
    ...prev,
    ...patch,
    sourceLabel: '商家上传',
    updatedAt: new Date().toISOString(),
  }
  pkg.hostMeta = next
  await prisma.album.update({
    where: { id: albumId },
    data: { contentPackageJson: pkg },
  })
  return readHostMeta({ ...album, contentPackageJson: pkg, publicCase: album.publicCase })
}

async function hostAlbum(albumId, { storeId, merchantId }) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const meta = await writeHostMeta(albumId, {
    hosted: true,
    visibility: 'private',
  })
  return { albumId, ...meta, message: '已托管到案例站（默认不公开）' }
}

async function unhostAlbum(albumId, { storeId, merchantId }) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)

  if (album.publicCase && album.publicCase.id) {
    const { hideCaseFromStorefront } = require('./case-publish-window.service')
    try {
      await hideCaseFromStorefront(album.publicCase.id, { storeId, merchantId })
    } catch (_) {
      /* 未公开也可取消托管 */
    }
    await prisma.publicCase.update({
      where: { id: album.publicCase.id },
      data: { storefrontHidden: true, seoNoindex: true },
    })
  }

  const meta = await writeHostMeta(albumId, {
    hosted: false,
    visibility: 'private',
  })
  return { albumId, ...meta, message: '已取消托管；公域已下线，档案仍在小程序' }
}

async function unpublishHostedCase(albumId, { storeId, merchantId }) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  if (album.publicCase && album.publicCase.id) {
    const { hideCaseFromStorefront } = require('./case-publish-window.service')
    await hideCaseFromStorefront(album.publicCase.id, { storeId, merchantId })
  }
  const meta = await writeHostMeta(albumId, {
    hosted: true,
    visibility: 'private',
  })
  return { albumId, ...meta, message: '已取消公开，仍作为私密档案托管' }
}

/**
 * 保存概况/FAQ 公开稿修订（不覆盖确认件）
 */
async function saveHostedPublicCopy(albumId, { storeId, merchantId, overview, faq }) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const prev = readHostMeta(album)
  const revision = {
    at: new Date().toISOString(),
    overview: String(overview != null ? overview : prev.overview || ''),
    faq: Array.isArray(faq) ? faq : prev.faq,
    kind: 'merchant_revision',
  }
  const revisions = [...(prev.revisions || []), revision].slice(-50)
  const meta = await writeHostMeta(albumId, {
    hosted: true,
    overview: revision.overview,
    faq: revision.faq,
    revisions,
  })

  if (album.publicCase) {
    const cj =
      album.publicCase.contentJson && typeof album.publicCase.contentJson === 'object'
        ? { ...album.publicCase.contentJson }
        : {}
    cj.hostPublicCopy = {
      overview: revision.overview,
      faq: revision.faq,
      updatedAt: revision.at,
    }
    await prisma.publicCase.update({
      where: { id: album.publicCase.id },
      data: {
        summary: revision.overview || album.publicCase.summary,
        contentJson: cj,
      },
    })
  }

  return { albumId, ...meta, message: '公开稿已更新（修订另存）' }
}

/**
 * 冻结车主确认件（不可静默覆盖）
 */
async function freezeConfirmedDoc(albumId, { storeId, merchantId, docType, payload }) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const prev = readHostMeta(album)
  const entry = {
    id: `conf_${Date.now()}`,
    docType: String(docType || 'report'),
    confirmedAt: new Date().toISOString(),
    payload: payload && typeof payload === 'object' ? payload : { text: String(payload || '') },
    immutable: true,
  }
  const confirmedDocs = [...(prev.confirmedDocs || []), entry]
  const meta = await writeHostMeta(albumId, { confirmedDocs })
  return { albumId, confirmedDoc: entry, ...meta }
}

async function listHostedCasesForStore(storeId) {
  const albums = await prisma.album.findMany({
    where: { storeId },
    include: { publicCase: true },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })
  return albums
    .map((album) => {
      const meta = readHostMeta(album)
      if (!meta.hosted && !(album.publicCase && album.publicCase.status === PUBLIC_CASE_STATUS.PUBLISHED)) {
        return null
      }
      return {
        albumId: album.id,
        caseId: album.publicCase && album.publicCase.id,
        title:
          (album.publicCase && album.publicCase.title) ||
          album.serviceName ||
          '未命名案例',
        serviceName: album.serviceName || '',
        hosted: meta.hosted,
        visibility:
          album.publicCase &&
          album.publicCase.status === PUBLIC_CASE_STATUS.PUBLISHED &&
          !album.publicCase.storefrontHidden
            ? 'public'
            : 'private',
        overview: meta.overview || (album.publicCase && album.publicCase.summary) || '',
        updatedAt: meta.updatedAt || album.updatedAt,
        sourceLabel: '商家上传',
        publicPath:
          album.publicCase && album.publicCase.slug
            ? `/case/${album.publicCase.slug}.html`
            : album.publicCase
              ? `/case/?id=${album.publicCase.id}`
              : '',
      }
    })
    .filter(Boolean)
}

/** 导出档案包（元数据 JSON；媒体 URL 清单） */
async function exportAlbumArchive(albumId, { storeId, merchantId }) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const meta = readHostMeta(album)
  const images = (album.images || []).map((img) => ({
    id: img.id,
    url: img.url || '',
    desensitizedUrl: img.desensitizedUrl || '',
    nodeId: img.nodeId || '',
  }))
  return {
    exportedAt: new Date().toISOString(),
    albumId,
    serviceName: album.serviceName || '',
    hostMeta: meta,
    publicCase: album.publicCase
      ? {
          id: album.publicCase.id,
          title: album.publicCase.title,
          status: album.publicCase.status,
          summary: album.publicCase.summary,
        }
      : null,
    images,
    sourceLabel: '商家上传',
  }
}

/**
 * 硬删：二次确认后公域净空并删相册（审计日志先写入 content 操作痕迹）
 * confirmText 必须为 DELETE
 */
async function hardDeleteAlbum(albumId, { storeId, merchantId, confirmText }) {
  if (String(confirmText || '') !== 'DELETE') {
    const err = new Error('请传入 confirmText: DELETE 以确认硬删')
    err.status = 400
    err.code = 'HARD_DELETE_CONFIRM'
    throw err
  }
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)

  try {
    await unhostAlbum(albumId, { storeId, merchantId })
  } catch (_) {
    /* continue */
  }

  const audit = {
    action: 'hard_delete_album',
    albumId,
    storeId,
    merchantId,
    at: new Date().toISOString(),
    serviceName: album.serviceName || '',
  }
  // 轻量审计：写入独立表前先落 system 风格日志
  try {
    // eslint-disable-next-line no-console
    console.info('[HARD_DELETE_AUDIT]', JSON.stringify(audit))
  } catch (_) {
    /* ignore */
  }

  await prisma.album.delete({ where: { id: albumId } })
  return { deleted: true, audit }
}

module.exports = {
  readHostMeta,
  writeHostMeta,
  hostAlbum,
  unhostAlbum,
  unpublishHostedCase,
  saveHostedPublicCopy,
  freezeConfirmedDoc,
  listHostedCasesForStore,
  exportAlbumArchive,
  hardDeleteAlbum,
}
