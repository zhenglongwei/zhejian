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
  const isRegisteredOutcome = (outcome) => {
    const code = String(outcome || '').trim()
    return Boolean(code) && code !== 'not_analyzed' && code !== 'pending'
  }
  const put = (url, row) => {
    const write = (key) => {
      if (!key) return
      const prev = index.get(key)
      const prevRegistered = prev && isRegisteredOutcome(prev.maskOutcome)
      const nextRegistered = isRegisteredOutcome(row && row.maskOutcome)
      // 节点已登记结论（成功或失败）不被空行/未分析盖掉；可合并媒体产物 URL
      if (prevRegistered && !nextRegistered) {
        index.set(key, {
          ...row,
          ...prev,
          maskedUrl: prev.maskedUrl || (row && row.maskedUrl) || '',
          preMaskedUrl: prev.preMaskedUrl || (row && row.preMaskedUrl) || '',
          desensitizeStatus:
            prev.desensitizeStatus || (row && row.desensitizeStatus) || '',
          riskTags:
            (Array.isArray(prev.riskTags) && prev.riskTags.length
              ? prev.riskTags
              : null) ||
            (row && row.riskTags) ||
            [],
          maskRegions:
            (Array.isArray(prev.maskRegions) && prev.maskRegions.length
              ? prev.maskRegions
              : null) ||
            (row && row.maskRegions) ||
            [],
        })
        return
      }
      index.set(key, row)
    }
    rawUrlLookupKeys(url).forEach(write)
    const masked = String((row && (row.maskedUrl || row.preMaskedUrl)) || '').trim()
    if (masked) {
      rawUrlLookupKeys(masked).forEach(write)
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
  // 节点图对象 + 媒体表：success 且无脱敏产物 = ok_no_privacy（可展示原图）
  try {
    const album = await prisma.album.findUnique({
      where: { id: albumId },
      select: { contentPackageJson: true },
    })
    const urls = new Set()
    const collect = (slot) => {
      if (!slot) return
      if (typeof slot === 'string') {
        if (slot.trim()) urls.add(slot.trim())
        return
      }
      if (typeof slot !== 'object') return
      const raw = String(slot.url || slot.src || slot.rawUrl || '').trim()
      if (raw) urls.add(raw)
      const outcome = String(slot.maskOutcome || '').trim()
      const masked = String(slot.maskedUrl || slot.preMaskedUrl || '').trim()
      const regions = Array.isArray(slot.maskRegions) ? slot.maskRegions : []
      if (!raw) return
      // 只登记「真有结论或产物」的节点图。裸图不写入 not_analyzed，
      // 否则会挡住后面媒体表 success，托管又整本重跑大模型。
      if (!outcome && !masked) return
      put(raw, {
        status: masked ? 'masked_ready' : '',
        desensitizeStatus:
          outcome === 'ok_no_privacy' || outcome === 'ok_masked' ? 'success' : '',
        riskTags: regions.length ? ['privacy'] : [],
        maskedUrl: masked,
        preMaskedUrl: masked,
        maskOutcome: outcome || (masked ? 'ok_masked' : ''),
        maskRegions: regions,
      })
    }
    const walkBag = (bag) => {
      if (!bag || typeof bag !== 'object') return
      ;['photos', 'deliveryPhotos', 'discoveryImages', 'pendingImages'].forEach((key) => {
        ;(Array.isArray(bag[key]) ? bag[key] : []).forEach(collect)
      })
      ;['findings', 'workItems', 'items', 'lines'].forEach((key) => {
        ;(Array.isArray(bag[key]) ? bag[key] : []).forEach((row) => {
          if (!row || typeof row !== 'object') return
          collect(row)
          ;(Array.isArray(row.images) ? row.images : []).forEach(collect)
          if (row.evidenceUrl) collect({ url: row.evidenceUrl, maskedUrl: row.evidenceMaskedUrl })
        })
      })
      if (bag.deliveryExteriorUrl) {
        collect({
          url: bag.deliveryExteriorUrl,
          maskedUrl: bag.deliveryExteriorMaskedUrl,
          maskOutcome: bag.deliveryExteriorMaskOutcome,
        })
      }
    }
    const pkg =
      album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
        ? album.contentPackageJson
        : {}
    ;(Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []).forEach((node) => {
      if (!node) return
      if (node.content) walkBag(node.content)
      if (node.photoDraft) walkBag(node.photoDraft)
      if (node.document && node.document.payload) walkBag(node.document.payload)
    })
    const list = [...urls].slice(0, 120)
    if (list.length) {
      const { stripUrlQuery } = require('../lib/media-signed-url')
      // 节点上可能是带签的 URL，媒体表常存去参后的；两侧都查
      const urlCandidates = [
        ...new Set(
          list.flatMap((u) => {
            const raw = String(u || '').trim()
            const bare = stripUrlQuery(raw)
            return [raw, bare].filter(Boolean)
          }),
        ),
      ].slice(0, 240)
      const mediaRows = await prisma.mediaAsset.findMany({
        where: { url: { in: urlCandidates } },
        take: 200,
      })
      mediaRows.forEach((media) => {
        if (!media || !media.url) return
        put(media.url, {
          status: '',
          desensitizeStatus: media.desensitizeStatus || '',
          riskTags: media.riskTags || [],
          maskedUrl: media.desensitizedUrl || '',
          preMaskedUrl: media.desensitizedUrl || '',
        })
      })
    }
  } catch (_) {
    /* node/media optional */
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
