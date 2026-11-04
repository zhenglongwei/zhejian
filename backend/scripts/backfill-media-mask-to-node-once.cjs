/**
 * 一次性：把媒体表里已存在的打码产物回填到节点图对象（maskOutcome=ok_masked）。
 *
 * 背景：历史上 AI 分析打码没带 albumId，结论只落在媒体表 / 任务行，节点没有 maskOutcome；
 * 上线状态机后这些图会被当「未分析」重跑模型。先跑本脚本回填，再跑 migrate-stub 脚本清假产物。
 *
 * 判定：
 * - 节点槽位已有 ok_masked / ok_no_privacy 或已有 maskedUrl → 跳过（幂等）
 * - 媒体表产物与原图相同、或脱敏文件与原图字节一致 → 假产物，跳过（交给 migrate-stub-mask-copies-once）
 * - 媒体表 success、无 riskTags 却有产物 → 旧「无敏感也复制」假产物，跳过
 * - 其余 → 回填 ok_masked + maskedUrl + maskSource=auto
 *
 * 预演：DRY_RUN=1 node scripts/backfill-media-mask-to-node-once.cjs
 * 落库：APPLY=1 node scripts/backfill-media-mask-to-node-once.cjs
 *
 * 建议顺序：APPLY=1 migrate-stub-mask-copies-once → 本脚本 DRY_RUN → 本脚本 APPLY
 */
'use strict'

const { prisma } = require('../src/lib/prisma')
const { isStubCopyArtifact } = require('../src/lib/media-file-compare')
const {
  parseObjectKeyFromPublicUrl,
  parseDesensitizedObjectKeyFromPublicUrl,
} = require('../src/lib/media-storage')
const { stripUrlQuery } = require('../src/lib/media-signed-url')
const {
  collectFlowImageRefs,
  writeMaskedPairsIntoFlowNodes,
} = require('../src/utils/flow-photo-mask-writeback')

const dryRun = String(process.env.DRY_RUN || '') === '1' || String(process.env.APPLY || '') !== '1'

function bare(url) {
  return stripUrlQuery(String(url || '').trim())
}

function urlsEqual(a, b) {
  const x = bare(a)
  const y = bare(b)
  return Boolean(x && y && x === y)
}

function riskTagList(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((t) => String(t || '').trim()).filter(Boolean)
}

function isStubPair(rawUrl, productUrl, media) {
  if (!bare(productUrl)) return false
  if (urlsEqual(rawUrl, productUrl)) return true
  const rawKey =
    (media && media.objectKey) || parseObjectKeyFromPublicUrl(rawUrl) || ''
  const productKey =
    (media && media.desensitizedKey) ||
    parseDesensitizedObjectKeyFromPublicUrl(productUrl) ||
    parseObjectKeyFromPublicUrl(productUrl) ||
    ''
  if (rawKey && productKey && isStubCopyArtifact(rawKey, productKey)) return true
  return false
}

/** 无敏感却仍挂着脱敏产物 = 历史假产物（复制或重编码） */
function isNoPrivacyFakeProduct(media) {
  if (!media) return false
  if (String(media.desensitizeStatus || '') !== 'success') return false
  if (!bare(media.desensitizedUrl || media.desensitizedKey)) return false
  return riskTagList(media.riskTags).length === 0
}

function needsBackfill(ref) {
  if (!ref) return false
  if (String(ref.maskedUrl || '').trim()) return false
  const outcome = String(ref.maskOutcome || '').trim()
  return outcome !== 'ok_masked' && outcome !== 'ok_no_privacy'
}

/** 节点上的 URL → 槽位清单（同一张图可能被多个节点引用） */
async function scanAlbumRefs() {
  const byUrl = new Map()
  const albumIds = new Set()
  let cursor = ''
  for (;;) {
    const rows = await prisma.album.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      select: { id: true, contentPackageJson: true },
      orderBy: { id: 'asc' },
      take: 100,
    })
    if (!rows.length) break
    rows.forEach((album) => {
      const pkg =
        album.contentPackageJson && typeof album.contentPackageJson === 'object'
          ? album.contentPackageJson
          : null
      if (!pkg || !Array.isArray(pkg.flowNodes) || !pkg.flowNodes.length) return
      collectFlowImageRefs(pkg.flowNodes).forEach((ref) => {
        const key = bare(ref.url)
        if (!key) return
        const list = byUrl.get(key) || []
        list.push({ albumId: album.id, url: ref.url, maskedUrl: ref.maskedUrl, maskOutcome: ref.maskOutcome })
        byUrl.set(key, list)
        albumIds.add(album.id)
      })
    })
    cursor = rows[rows.length - 1].id
  }
  return { byUrl, albumIds }
}

/** 补 evidenceUrl / deliveryExteriorUrl 的结论字段（写回工具只写 maskedUrl） */
function patchSiblingOutcomes(nodes, productByRaw) {
  let changed = false
  const next = nodes.map((node) => {
    if (!node || typeof node !== 'object') return node
    let nextNode = node
    let dirty = false

    const patchRow = (row) => {
      if (!row || typeof row !== 'object') return row
      const product = productByRaw.get(bare(row.evidenceUrl))
      if (!product) return row
      if (
        String(row.evidenceMaskedUrl || '') === product &&
        String(row.evidenceMaskOutcome || '') === 'ok_masked'
      ) {
        return row
      }
      dirty = true
      return {
        ...row,
        evidenceMaskedUrl: product,
        evidenceMaskOutcome: 'ok_masked',
        evidenceMaskSource: 'auto',
      }
    }

    const patchBag = (bag) => {
      if (!bag || typeof bag !== 'object') return bag
      let nextBag = bag
      ;['findings', 'workItems', 'items', 'lines'].forEach((key) => {
        if (!Array.isArray(nextBag[key])) return
        let listChanged = false
        const list = nextBag[key].map((row) => {
          const patched = patchRow(row)
          if (patched !== row) listChanged = true
          return patched
        })
        if (listChanged) nextBag = { ...nextBag, [key]: list }
      })
      const product = productByRaw.get(bare(nextBag.deliveryExteriorUrl))
      if (
        product &&
        (String(nextBag.deliveryExteriorMaskedUrl || '') !== product ||
          String(nextBag.deliveryExteriorMaskOutcome || '') !== 'ok_masked')
      ) {
        nextBag = {
          ...nextBag,
          deliveryExteriorMaskedUrl: product,
          deliveryExteriorMaskOutcome: 'ok_masked',
          deliveryExteriorMaskSource: 'auto',
        }
      }
      return nextBag
    }

    ;['content', 'photoDraft'].forEach((key) => {
      const bag = patchBag(nextNode[key])
      if (bag !== nextNode[key]) nextNode = { ...nextNode, [key]: bag }
    })
    if (nextNode.document && nextNode.document.payload) {
      const bag = patchBag(nextNode.document.payload)
      if (bag !== nextNode.document.payload) {
        nextNode = { ...nextNode, document: { ...nextNode.document, payload: bag } }
      }
    }
    if (dirty) changed = true
    return nextNode
  })
  return { nodes: next, changed }
}

async function main() {
  console.log(
    `[backfill-media-mask-to-node-once] start dryRun=${dryRun}（落库 APPLY=1；预演 DRY_RUN=1）`,
  )
  const { byUrl, albumIds } = await scanAlbumRefs()
  console.log(`[scan] albums=${albumIds.size} refs=${byUrl.size}`)

  const mediaRows = await prisma.mediaAsset.findMany({
    where: { OR: [{ desensitizedUrl: { not: '' } }, { desensitizedKey: { not: '' } }] },
    select: {
      id: true,
      url: true,
      objectKey: true,
      desensitizedUrl: true,
      desensitizedKey: true,
      desensitizeStatus: true,
      riskTags: true,
    },
  })

  const pairsByAlbum = new Map()
  let notInNode = 0
  let alreadySettled = 0
  let stubCopy = 0
  let fakeNoPrivacy = 0
  let backfilled = 0

  mediaRows.forEach((media) => {
    const product = String(media.desensitizedUrl || '').trim()
    if (!product) return
    const hits = byUrl.get(bare(media.url)) || []
    if (!hits.length) {
      notInNode += 1
      return
    }
    const pending = hits.filter((ref) => needsBackfill(ref))
    if (!pending.length) {
      alreadySettled += 1
      return
    }
    if (isStubPair(media.url, product, media)) {
      stubCopy += 1
      return
    }
    if (isNoPrivacyFakeProduct(media)) {
      fakeNoPrivacy += 1
      return
    }
    pending.forEach((ref) => {
      const list = pairsByAlbum.get(ref.albumId) || []
      list.push({
        rawUrl: ref.url,
        maskedUrl: product,
        maskOutcome: 'ok_masked',
        maskSource: 'auto',
      })
      pairsByAlbum.set(ref.albumId, list)
      backfilled += 1
    })
  })

  const touchedAlbums = [...new Set([...pairsByAlbum.keys()])]
  for (const albumId of touchedAlbums) {
    const pairs = pairsByAlbum.get(albumId) || []
    if (!pairs.length) continue
    const album = await prisma.album.findUnique({
      where: { id: albumId },
      select: { contentPackageJson: true },
    })
    const pkg =
      album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
        ? album.contentPackageJson
        : null
    if (!pkg || !Array.isArray(pkg.flowNodes)) continue
    const productByRaw = new Map()
    pairs.forEach((pair) => {
      const key = bare(pair.rawUrl)
      if (key) productByRaw.set(key, pair.maskedUrl)
    })
    const written = writeMaskedPairsIntoFlowNodes(pkg.flowNodes, pairs)
    const sibling = patchSiblingOutcomes(written.nodes, productByRaw)
    if (!written.changed && !sibling.changed) continue
    if (dryRun) continue
    await prisma.album.update({
      where: { id: albumId },
      data: { contentPackageJson: { ...pkg, flowNodes: sibling.nodes } },
    })
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        albumsScanned: albumIds.size,
        mediaScanned: mediaRows.length,
        albumsToUpdate: touchedAlbums.length,
        backfilled,
        skipped: { alreadySettled, notInNode, stubCopy, fakeNoPrivacy },
        nextStep: dryRun
          ? '核对无异常后：APPLY=1 node scripts/backfill-media-mask-to-node-once.cjs'
          : '已落库；可再跑 DRY_RUN=1 复核 backfilled 应为 0',
      },
      null,
      2,
    ),
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
