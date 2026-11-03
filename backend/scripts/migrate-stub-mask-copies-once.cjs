/**
 * 一次性：清掉「原图复制冒充打码图」的历史假产物。
 *
 * 判定（任一命中即为假产物）：
 * 1) 打码 URL 与原图 URL 去参后相同
 * 2) 磁盘上原图与脱敏产物字节完全一致（stub copy）
 * 3) 媒体表已 success、无 riskTags、却仍有脱敏产物（旧「无敏感也复制/重编码」路径；含 model-mask-v1）
 * 4) 脱敏任务资产：无 riskTags 且产物 URL=原图，或对应媒体被 3) 命中
 *
 * 处理：
 * - MediaAsset：清空 desensitizedUrl/Key；无 riskTags 时保持 success（= ok_no_privacy 已记账）
 * - DesensitizeAsset：清空 maskedUrl/preMaskedUrl
 * - 相册 flowNodes 图对象：清空假 maskedUrl/preMaskedUrl，写 maskOutcome=ok_no_privacy
 *
 * 不删磁盘文件；历史只靠本脚本一次清，禁止业务路径顺带修存量。
 *
 * 预演：DRY_RUN=1 node scripts/migrate-stub-mask-copies-once.cjs
 * 落库：APPLY=1 node scripts/migrate-stub-mask-copies-once.cjs
 */
'use strict'

const { prisma } = require('../src/lib/prisma')
const { isStubCopyArtifact } = require('../src/lib/media-file-compare')
const {
  parseObjectKeyFromPublicUrl,
  parseDesensitizedObjectKeyFromPublicUrl,
} = require('../src/lib/media-storage')
const { stripUrlQuery } = require('../src/lib/media-signed-url')

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

function patchSlot(slot, clearedProductUrls, clearedRawUrls) {
  if (!slot || typeof slot !== 'object') return { next: slot, changed: false }
  const raw = String(slot.url || slot.src || slot.rawUrl || '').trim()
  const product = String(slot.maskedUrl || slot.preMaskedUrl || '').trim()
  if (!raw || !product) return { next: slot, changed: false }
  const regions = Array.isArray(slot.maskRegions) ? slot.maskRegions : []
  const hit =
    isStubPair(raw, product, null) ||
    urlsEqual(raw, product) ||
    (clearedProductUrls && clearedProductUrls.has(bare(product))) ||
    (clearedRawUrls && clearedRawUrls.has(bare(raw)) && regions.length === 0)
  if (!hit) return { next: slot, changed: false }
  return {
    next: {
      ...slot,
      maskedUrl: '',
      preMaskedUrl: '',
      maskOutcome: 'ok_no_privacy',
      maskRegions: [],
    },
    changed: true,
  }
}

function patchList(list, clearedProductUrls, clearedRawUrls) {
  if (!Array.isArray(list)) return { next: list, changed: false }
  let changed = false
  const next = list.map((item) => {
    if (typeof item === 'string') {
      // 纯字符串原图，无假产物字段
      return item
    }
    const r = patchSlot(item, clearedProductUrls, clearedRawUrls)
    if (r.changed) changed = true
    return r.next
  })
  return { next, changed }
}

function patchBag(bag, clearedProductUrls, clearedRawUrls) {
  if (!bag || typeof bag !== 'object') return { next: bag, changed: false }
  let next = bag
  let changed = false
  const touchList = (key) => {
    const r = patchList(next[key], clearedProductUrls, clearedRawUrls)
    if (r.changed) {
      next = { ...next, [key]: r.next }
      changed = true
    }
  }
  ;['photos', 'deliveryPhotos', 'discoveryImages', 'pendingImages'].forEach(touchList)
  ;['findings', 'workItems', 'items', 'lines'].forEach((key) => {
    if (!Array.isArray(next[key])) return
    let rowChanged = false
    const rows = next[key].map((row) => {
      if (!row || typeof row !== 'object') return row
      let cur = row
      const images = patchList(cur.images, clearedProductUrls, clearedRawUrls)
      if (images.changed) {
        cur = { ...cur, images: images.next }
        rowChanged = true
      }
      const self = patchSlot(cur, clearedProductUrls, clearedRawUrls)
      if (self.changed) {
        cur = self.next
        rowChanged = true
      }
      if (cur.evidenceUrl && cur.evidenceMaskedUrl && urlsEqual(cur.evidenceUrl, cur.evidenceMaskedUrl)) {
        cur = { ...cur, evidenceMaskedUrl: '' }
        rowChanged = true
      }
      return cur
    })
    if (rowChanged) {
      next = { ...next, [key]: rows }
      changed = true
    }
  })
  const exteriorHit =
    next.deliveryExteriorUrl &&
    next.deliveryExteriorMaskedUrl &&
    (urlsEqual(next.deliveryExteriorUrl, next.deliveryExteriorMaskedUrl) ||
      isStubPair(next.deliveryExteriorUrl, next.deliveryExteriorMaskedUrl, null) ||
      (clearedProductUrls &&
        clearedProductUrls.has(bare(next.deliveryExteriorMaskedUrl))) ||
      (clearedRawUrls && clearedRawUrls.has(bare(next.deliveryExteriorUrl))))
  if (exteriorHit) {
    next = {
      ...next,
      deliveryExteriorMaskedUrl: '',
      deliveryExteriorMaskOutcome: 'ok_no_privacy',
    }
    changed = true
  }
  return { next, changed }
}

function patchFlowNodes(flowNodes, clearedProductUrls, clearedRawUrls) {
  let changed = false
  const nodes = (Array.isArray(flowNodes) ? flowNodes : []).map((node) => {
    if (!node || typeof node !== 'object') return node
    let next = node
    let dirty = false
    ;['content', 'photoDraft'].forEach((key) => {
      const r = patchBag(next[key], clearedProductUrls, clearedRawUrls)
      if (r.changed) {
        next = { ...next, [key]: r.next }
        dirty = true
      }
    })
    if (next.document && next.document.payload) {
      const r = patchBag(next.document.payload, clearedProductUrls, clearedRawUrls)
      if (r.changed) {
        next = {
          ...next,
          document: { ...next.document, payload: r.next },
        }
        dirty = true
      }
    }
    if (dirty) changed = true
    return next
  })
  return { nodes, changed }
}

/**
 * @returns {{ scanned: number, hit: number, clearedProductUrls: Set<string>, clearedRawUrls: Set<string> }}
 */
async function migrateMedia() {
  const rows = await prisma.mediaAsset.findMany({
    where: {
      OR: [{ desensitizedUrl: { not: '' } }, { desensitizedKey: { not: '' } }],
    },
  })
  let hit = 0
  const clearedProductUrls = new Set()
  const clearedRawUrls = new Set()
  for (const media of rows) {
    const stub =
      isStubPair(media.url, media.desensitizedUrl, media) ||
      (media.objectKey &&
        media.desensitizedKey &&
        isStubCopyArtifact(media.objectKey, media.desensitizedKey)) ||
      isNoPrivacyFakeProduct(media)
    if (!stub) continue
    hit += 1
    if (bare(media.desensitizedUrl)) clearedProductUrls.add(bare(media.desensitizedUrl))
    if (bare(media.url)) clearedRawUrls.add(bare(media.url))
    if (dryRun) continue
    const tags = riskTagList(media.riskTags)
    await prisma.mediaAsset.update({
      where: { id: media.id },
      data: {
        desensitizedUrl: '',
        desensitizedKey: '',
        // 无敏感假产物 → 记已跑过无产物；有风险标签却假产物 → 标需人工，避免当成功
        desensitizeStatus: tags.length ? 'need_manual' : 'success',
      },
    })
  }
  return { scanned: rows.length, hit, clearedProductUrls, clearedRawUrls }
}

async function migrateDesensitizeAssets(clearedProductUrls, clearedRawUrls) {
  const rows = await prisma.desensitizeAsset.findMany({
    where: {
      OR: [{ maskedUrl: { not: '' } }, { preMaskedUrl: { not: '' } }],
    },
  })
  let hit = 0
  for (const asset of rows) {
    const product = asset.maskedUrl || asset.preMaskedUrl
    const tags = riskTagList(asset.riskTags)
    const stubByUrl = isStubPair(asset.rawUrl, product, null)
    const stubByMedia =
      (bare(product) && clearedProductUrls.has(bare(product))) ||
      (bare(asset.rawUrl) && clearedRawUrls.has(bare(asset.rawUrl)) && !tags.length)
    // 无风险标签却仍挂打码 URL：与媒体表「无敏感假产物」同口径
    const stubNoPrivacyProduct = !tags.length && Boolean(bare(product))
    if (!stubByUrl && !stubByMedia && !stubNoPrivacyProduct) continue
    hit += 1
    if (dryRun) continue
    await prisma.desensitizeAsset.update({
      where: { taskId_assetId: { taskId: asset.taskId, assetId: asset.assetId } },
      data: { maskedUrl: '', preMaskedUrl: '' },
    })
  }
  return { scanned: rows.length, hit }
}

async function migrateAlbums(clearedProductUrls, clearedRawUrls) {
  const albums = await prisma.album.findMany({
    select: { id: true, contentPackageJson: true },
  })
  let scanned = 0
  let hit = 0
  for (const album of albums) {
    const pkg =
      album.contentPackageJson && typeof album.contentPackageJson === 'object'
        ? album.contentPackageJson
        : null
    if (!pkg || !Array.isArray(pkg.flowNodes) || !pkg.flowNodes.length) continue
    scanned += 1
    const { nodes, changed } = patchFlowNodes(
      pkg.flowNodes,
      clearedProductUrls,
      clearedRawUrls,
    )
    if (!changed) continue
    hit += 1
    if (dryRun) continue
    await prisma.album.update({
      where: { id: album.id },
      data: { contentPackageJson: { ...pkg, flowNodes: nodes } },
    })
  }
  return { scanned, hit }
}

async function main() {
  console.log(
    `[migrate-stub-mask-copies-once] start dryRun=${dryRun} (落库请设 APPLY=1；预演 DRY_RUN=1)`,
  )
  const media = await migrateMedia()
  const assets = await migrateDesensitizeAssets(
    media.clearedProductUrls,
    media.clearedRawUrls,
  )
  const albums = await migrateAlbums(media.clearedProductUrls, media.clearedRawUrls)
  console.log(
    JSON.stringify(
      {
        dryRun,
        media: { scanned: media.scanned, hit: media.hit },
        desensitizeAssets: assets,
        albums,
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
