/**
 * 一次性数据迁移：交车验收/外观照迁到 2026-11-10 定稿结构（程序内不再做旧结构兼容）。
 *
 * 迁移内容（只动 album.contentPackageJson，幂等）：
 * 1. 交车节点 content.acceptance（旧 {items:[{project,note}]} 或旧三段）→ content.acceptanceItems
 *    [{ id, name, standard, method, images, note, result }]；结果留空（不替历史单编造结果）。
 * 2. content.selectedDeliveryUrls / deliveryExteriorUrl → content.deliveryPhotos [{url}]（最多 3 张）。
 * 3. contentPackageJson.archiveCopy → content.repairBrief / content.ownerFaqs（仅空时补），迁完删除 archiveCopy。
 * 4. 完工报告 document.payload.acceptance → payload.acceptanceItems；payload.deliveryPhotos 归一为 [{url}]。
 * 5. 删除节点上旧字段（含 *MaskedUrl 伴生字段）。
 *
 * 用法：
 *   node scripts/migrate-delivery-acceptance.js --dry-run
 *   node scripts/migrate-delivery-acceptance.js
 *   node scripts/migrate-delivery-acceptance.js --limit=200 --album=xxx
 */
const { prisma } = require('../src/lib/prisma')

const MAX_PHOTOS = 3
const MAX_ACCEPTANCE = 20

function text(value) {
  return String(value == null ? '' : value).trim()
}

function urlOf(row) {
  return text(typeof row === 'object' && row ? row.url || row.rawUrl || row.src : row)
}

function normalizePhotos(raw) {
  const seen = {}
  const out = []
  ;(Array.isArray(raw) ? raw : []).forEach((row) => {
    const url = urlOf(row)
    if (!url || seen[url] || out.length >= MAX_PHOTOS) return
    seen[url] = true
    out.push({ url })
  })
  return out
}

function legacyAcceptanceRows(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'object') return []
  if (Array.isArray(raw.items) && raw.items.length) return raw.items
  if (raw.standard || raw.process || raw.result || raw.note) return [raw]
  return []
}

function normalizeAcceptanceRows(list) {
  return legacyAcceptanceRows(list)
    .map((row, index) => {
      const obj = row && typeof row === 'object' ? row : {}
      const name =
        text(obj.name || obj.project || obj['项目']).slice(0, 60) || '整体验收'
      const standard = text(obj.standard || obj['标准']).slice(0, 200)
      const note =
        text(obj.note || obj['验收']).slice(0, 300) ||
        [text(obj.process || obj['过程']), text(obj.result || obj['结果'])]
          .filter(Boolean)
          .join('；')
          .slice(0, 300)
      const images = (Array.isArray(obj.images) ? obj.images : [])
        .map((img) => urlOf(img))
        .filter(Boolean)
        .slice(0, 6)
        .map((url) => ({ url }))
      if (!name && !standard && !note) return null
      return {
        id: text(obj.id) || `acc_${index + 1}`,
        name,
        standard: standard || note,
        method: text(obj.method).slice(0, 60),
        images,
        note,
        result: ['pass', 'observe', 'rework'].includes(obj.result) ? obj.result : '',
      }
    })
    .filter(Boolean)
    .slice(0, MAX_ACCEPTANCE)
}

function stripLegacyAcceptanceKeys(bag) {
  if (!bag || typeof bag !== 'object') return false
  let changed = false
  ;[
    'acceptance',
    'selectedDeliveryUrls',
    'deliveryExteriorUrl',
    'deliveryExteriorMaskedUrl',
    'deliveryExteriorMaskOutcome',
    'deliveryExteriorMaskRegions',
  ].forEach((key) => {
    if (key in bag) {
      delete bag[key]
      changed = true
    }
  })
  return changed
}

function migrateBag(bag, patch) {
  if (!bag || typeof bag !== 'object') return false
  let changed = false
  const legacyPhotos = []
  if (Array.isArray(bag.selectedDeliveryUrls)) legacyPhotos.push(...bag.selectedDeliveryUrls)
  if (bag.deliveryExteriorUrl) legacyPhotos.unshift(bag.deliveryExteriorUrl)
  const hasAcceptance = Boolean(bag.acceptance)
  const LEGACY_KEYS = [
    'acceptance',
    'selectedDeliveryUrls',
    'deliveryExteriorUrl',
    'deliveryExteriorMaskedUrl',
    'deliveryExteriorMaskOutcome',
    'deliveryExteriorMaskRegions',
  ]
  const hasLegacyKeys = LEGACY_KEYS.some((key) => key in bag)
  if (!hasAcceptance && !legacyPhotos.length && !bag.deliveryPhotos && !hasLegacyKeys) return false

  if (hasAcceptance) {
    const rows = normalizeAcceptanceRows(bag.acceptance)
    if (rows.length) {
      bag.acceptanceItems = rows
      changed = true
    }
  }
  if (legacyPhotos.length) {
    const merged = normalizePhotos([].concat(legacyPhotos, bag.deliveryPhotos || []))
    if (merged.length) {
      bag.deliveryPhotos = merged
      changed = true
    }
  } else if (Array.isArray(bag.deliveryPhotos)) {
    const normalized = normalizePhotos(bag.deliveryPhotos)
    if (JSON.stringify(normalized) !== JSON.stringify(bag.deliveryPhotos)) {
      bag.deliveryPhotos = normalized
      changed = true
    }
  }
  if (Array.isArray(bag.acceptanceItems)) {
    const normalized = normalizeAcceptanceRows(bag.acceptanceItems)
    if (normalized.length && JSON.stringify(normalized) !== JSON.stringify(bag.acceptanceItems)) {
      bag.acceptanceItems = normalized
      changed = true
    }
  }
  if (changed && patch) patch()
  const stripped = stripLegacyAcceptanceKeys(bag)
  return changed || stripped
}

function migratePackage(pkg) {
  if (!pkg || typeof pkg !== 'object') return { pkg, changed: false, stats: {} }
  let changed = false
  const stats = { nodes: 0, reports: 0, archiveCopy: 0 }
  const mark = () => {
    changed = true
  }
  const nodes = Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []
  nodes.forEach((node) => {
    if (!node || typeof node !== 'object') return
    if (node.kind === 'delivery_photos') {
      const bagTouched = migrateBag(node.content || {}, mark)
      const draftTouched = migrateBag(node.photoDraft || {}, mark)
      if (bagTouched || draftTouched) {
        stats.nodes += 1
        changed = true
      }
      // archiveCopy 一次性迁入节点 content（只补空）
      const copy = pkg.archiveCopy && typeof pkg.archiveCopy === 'object' ? pkg.archiveCopy : null
      if (copy) {
        const content = node.content && typeof node.content === 'object' ? node.content : {}
        const summary = text(copy.summary || copy.aiSummary)
        if (summary && !text(content.repairBrief)) {
          content.repairBrief = summary.slice(0, 500)
          node.content = content
          changed = true
        }
        const faq = Array.isArray(copy.faq) ? copy.faq : []
        if (faq.length && !(Array.isArray(content.ownerFaqs) && content.ownerFaqs.length)) {
          content.ownerFaqs = faq
            .map((row, index) => ({
              id: text(row && row.id) || `faq_${index + 1}`,
              question: text(row && (row.q || row.question)),
              answer: text(row && (row.a || row.answer)),
            }))
            .filter((row) => row.question && row.answer)
            .slice(0, 5)
          node.content = content
          changed = true
        }
        if (changed) stats.archiveCopy = 1
      }
    }
    if (node.kind === 'repair_report' && node.document && node.document.payload) {
      const payload = node.document.payload
      const before = JSON.stringify(payload)
      if (payload.acceptance) {
        const rows = normalizeAcceptanceRows(payload.acceptance)
        if (rows.length) payload.acceptanceItems = rows
        delete payload.acceptance
      }
      if (Array.isArray(payload.acceptanceItems)) {
        payload.acceptanceItems = normalizeAcceptanceRows(payload.acceptanceItems)
      }
      if (Array.isArray(payload.deliveryPhotos)) {
        payload.deliveryPhotos = normalizePhotos(payload.deliveryPhotos)
      }
      ;['selectedDeliveryUrls', 'deliveryExteriorUrl', 'deliveryExteriorMaskedUrl'].forEach((key) => {
        delete payload[key]
      })
      if (JSON.stringify(payload) !== before) {
        changed = true
        stats.reports += 1
      }
    }
  })
  if (changed && pkg.archiveCopy) delete pkg.archiveCopy
  return { pkg, changed, stats }
}

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const limitArg = argv.find((arg) => arg.startsWith('--limit='))
  const albumArg = argv.find((arg) => arg.startsWith('--album='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) || 200 : 1000
  const albumId = albumArg ? albumArg.split('=')[1] : ''

  const albums = await prisma.album.findMany({
    where: { ...(albumId ? { id: albumId } : {}) },
    select: { id: true, contentPackageJson: true },
    take: limit,
    orderBy: { updatedAt: 'desc' },
  })

  console.log(
    `[migrate-delivery-acceptance] albums=${albums.length} dryRun=${dryRun} limit=${limit}`,
  )
  let touched = 0
  for (const album of albums) {
    const pkg = album.contentPackageJson
    if (!pkg || typeof pkg !== 'object') continue
    const cloned = JSON.parse(JSON.stringify(pkg))
    const { changed, stats } = migratePackage(cloned)
    if (!changed) continue
    touched += 1
    console.log(`- ${album.id}`, stats)
    if (dryRun) continue
    await prisma.album.update({
      where: { id: album.id },
      data: { contentPackageJson: cloned },
    })
  }
  console.log(`[migrate-delivery-acceptance] done. touched=${touched}${dryRun ? ' (dry-run)' : ''}`)
}

main()
  .catch((err) => {
    console.error('[migrate-delivery-acceptance] failed', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
