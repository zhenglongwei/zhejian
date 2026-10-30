/**
 * 托管公开读侧：把小程序核对内容里的打码图映射到原图 URL。
 * 事实层冻结后仍须用这张可公开面，不能回退未打码原图。
 */
const { prisma } = require('../lib/prisma')
const { rewriteMediaUrlForCurrentBase } = require('../lib/media-storage')
const { stripUrlQuery } = require('../lib/media-signed-url')
const { buildHostMaskTaskId } = require('./desensitize.constants')

function putMaskPair(byRawUrl, raw, masked) {
  const from = String(raw || '').trim()
  const to = String(masked || '').trim()
  if (!from || !to) return
  byRawUrl.set(from, to)
  byRawUrl.set(stripUrlQuery(from), to)
  try {
    const rewritten = rewriteMediaUrlForCurrentBase(from)
    if (rewritten) {
      byRawUrl.set(rewritten, to)
      byRawUrl.set(stripUrlQuery(rewritten), to)
    }
  } catch (_) {
    /* ignore */
  }
}

function mergeMaskAssets(byRawUrl, byNodeIdx, assets = []) {
  assets.forEach((asset) => {
    const masked = String(asset.maskedUrl || asset.preMaskedUrl || '').trim()
    if (!masked) return
    putMaskPair(byRawUrl, asset.rawUrl, masked)
    if (asset.nodeId != null && asset.idx != null) {
      byNodeIdx.set(`${asset.nodeId}:${Number(asset.idx)}`, masked)
    }
  })
}

async function loadHostedPublicMaskLookup(albumId) {
  const { buildPreMaskUrlLookup } = require('./desensitize.service')
  let packed = { ready: false, byRawUrl: new Map(), byNodeIdx: new Map() }
  try {
    packed = await buildPreMaskUrlLookup(albumId)
  } catch (_) {
    packed = { ready: false, byRawUrl: new Map(), byNodeIdx: new Map() }
  }
  const byRawUrl = packed.byRawUrl instanceof Map ? packed.byRawUrl : new Map()
  const byNodeIdx = packed.byNodeIdx instanceof Map ? packed.byNodeIdx : new Map()
  try {
    const hostTask = await prisma.desensitizeTask.findUnique({
      where: { taskId: buildHostMaskTaskId(albumId) },
      include: { assets: true },
    })
    mergeMaskAssets(byRawUrl, byNodeIdx, hostTask && hostTask.assets ? hostTask.assets : [])
  } catch (_) {
    /* host mask task optional */
  }
  return {
    ready: Boolean(packed.ready) || byRawUrl.size > 0,
    byRawUrl,
    byNodeIdx,
  }
}

/** 按原图/打码图 URL 索引任务行，供托管页判 call_failed / ok_no_privacy 等 */
async function loadHostMaskOutcomeIndex(albumId) {
  const { buildPreMaskTaskId, rawUrlLookupKeys } = require('./desensitize.constants')
  const index = new Map()
  const put = (url, row) => {
    rawUrlLookupKeys(url).forEach((key) => {
      if (key) index.set(key, row)
    })
    const masked = String((row && (row.maskedUrl || row.preMaskedUrl)) || '').trim()
    if (masked) {
      rawUrlLookupKeys(masked).forEach((key) => {
        if (key) index.set(key, row)
      })
    }
  }
  const taskIds = [buildHostMaskTaskId(albumId), buildPreMaskTaskId(albumId)]
  for (const taskId of taskIds) {
    try {
      const task = await prisma.desensitizeTask.findUnique({
        where: { taskId },
        include: { assets: true },
      })
      ;(task && task.assets ? task.assets : []).forEach((asset) => {
        put(asset.rawUrl, {
          status: asset.status,
          riskTags: asset.riskTags || [],
          maskedUrl: asset.maskedUrl || '',
          preMaskedUrl: asset.preMaskedUrl || '',
        })
      })
    } catch (_) {
      /* optional */
    }
  }
  return index
}

function lookupHostMaskOutcomeRow(index, url) {
  if (!index || !url) return null
  const { rawUrlLookupKeys } = require('./desensitize.constants')
  for (const key of rawUrlLookupKeys(url)) {
    if (index.has(key)) return index.get(key)
  }
  return null
}

module.exports = {
  putMaskPair,
  mergeMaskAssets,
  loadHostedPublicMaskLookup,
  loadHostMaskOutcomeIndex,
  lookupHostMaskOutcomeRow,
}
