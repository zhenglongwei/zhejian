/**
 * 一次性数据迁移：交车验收迁到 2026-11-10 二次收敛结构（程序内不再做旧结构兼容）。
 *
 * 目标结构：content.acceptanceItems / report.payload.acceptanceItems
 *   [{ id, kind: 'work' | 'exterior', name, images: [{url}], result: '', note }]
 *   一行一项：施工项目在前，「外观」固定最后一行；每行只有图片 / 结果 / 描述。
 *
 * 迁移内容（只动 album.contentPackageJson，幂等）：
 * 1. 旧 acceptance（{items:[{project,note}]} 或旧三段）→ acceptanceItems，kind 按行名判断。
 * 2. 旧「标准 / 怎么验」并入描述：note 与标准不同则追加，怎么验追加「怎么验：…」；原字段删除。
 *    结果留空（不替历史单编造结果）。
 * 3. 旧外观照（selectedDeliveryUrls / deliveryExteriorUrl / deliveryPhotos）→「外观」行 images（最多 3 张），
 *    迁完删除这些旧字段。
 * 4. contentPackageJson.archiveCopy → content.repairBrief / content.ownerFaqs（仅空时补），迁完删除 archiveCopy。
 * 5. 完工报告 document.payload 同步以上规则。
 *
 * 用法：
 *   node scripts/migrate-delivery-acceptance.js --dry-run
 *   node scripts/migrate-delivery-acceptance.js
 *   node scripts/migrate-delivery-acceptance.js --limit=200 --album=xxx
 */
const { prisma } = require('../src/lib/prisma')
const { resolveShared } = require('../src/utils/resolve-shared')

// 行源 = 施工项目：与商家交车页同一套规则（共享层单一真源）
const { buildAcceptanceRowsFromWorkItems } = resolveShared('utils/service-flow-docs.js')

const MAX_EXTERIOR = 3
const MAX_ITEM_IMAGES = 6
const MAX_ACCEPTANCE = 20
const RESULTS = ['pass', 'observe', 'rework']
const EXTERIOR_NAME = '外观'
const EXTERIOR_ID = 'exterior'

function text(value) {
  return String(value == null ? '' : value).trim()
}

function urlOf(row) {
  return text(typeof row === 'object' && row ? row.url || row.rawUrl || row.src : row)
}

function normalizePhotos(raw, max = MAX_EXTERIOR) {
  const seen = {}
  const out = []
  ;(Array.isArray(raw) ? raw : []).forEach((row) => {
    const url = urlOf(row)
    if (!url || seen[url] || out.length >= max) return
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

/** 旧「标准 / 怎么验」并进一句描述，不丢信息也不重复 */
function mergeNote(obj) {
  const note = text(obj.note || obj['验收'] || obj['描述'] || obj['验收描述'])
  const standard = text(obj.standard || obj['标准'])
  const method = text(obj.method || obj['怎么验'])
  const pieces = []
  if (note) pieces.push(note)
  if (standard && standard !== note) pieces.push(standard)
  if (method && !pieces.some((item) => item.includes(method))) pieces.push(`怎么验：${method}`)
  if (!pieces.length) {
    // 旧结构里「结果」可能是一句中文结论；枚举值（pass/observe/rework）不进描述
    const legacyResult = text(obj['结果'] || obj.result)
    const fallback = [
      text(obj.process || obj['过程']),
      RESULTS.includes(legacyResult) ? '' : legacyResult,
    ]
      .filter(Boolean)
      .join('；')
    if (fallback) pieces.push(fallback)
  }
  return pieces.join('；').slice(0, 300)
}

function normalizeAcceptanceRows(list) {
  return legacyAcceptanceRows(list)
    .map((row, index) => {
      const obj = row && typeof row === 'object' ? row : {}
      const rawName = text(obj.name || obj.project || obj['项目'])
      const isExterior =
        text(obj.kind) === 'exterior' ||
        text(obj['类别']) === '外观' ||
        rawName === EXTERIOR_NAME
      const name = isExterior ? EXTERIOR_NAME : rawName
      const note = mergeNote(obj)
      const images = normalizePhotos(obj.images, isExterior ? MAX_EXTERIOR : MAX_ITEM_IMAGES)
      if (!name && !note && !images.length) return null
      if (!name) return null
      return {
        id: isExterior ? EXTERIOR_ID : text(obj.id) || `acc_${index + 1}`,
        kind: isExterior ? 'exterior' : 'work',
        name,
        images,
        result: RESULTS.includes(obj.result) ? obj.result : '',
        note,
      }
    })
    .filter(Boolean)
    .slice(0, MAX_ACCEPTANCE)
}

/** 外观照并入「外观」行：有行就补空，没行就追加到末尾 */
function ensureExteriorRow(rows, photos) {
  const list = (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }))
  const imgs = normalizePhotos(photos, MAX_EXTERIOR)
  const idx = list.findIndex((row) => row.kind === 'exterior')
  if (idx >= 0) {
    const row = list[idx]
    if (imgs.length && !(Array.isArray(row.images) && row.images.length)) row.images = imgs
    row.kind = 'exterior'
    row.name = EXTERIOR_NAME
    return list
  }
  if (!imgs.length) return list
  list.push({
    id: EXTERIOR_ID,
    kind: 'exterior',
    name: EXTERIOR_NAME,
    images: imgs,
    result: '',
    note: '',
  })
  return list
}

const LEGACY_KEYS = [
  'acceptance',
  'deliveryPhotos',
  'selectedDeliveryUrls',
  'deliveryExteriorUrl',
  'deliveryExteriorMaskedUrl',
  'deliveryExteriorMaskOutcome',
  'deliveryExteriorMaskRegions',
]

function stripLegacyAcceptanceKeys(bag) {
  if (!bag || typeof bag !== 'object') return false
  let changed = false
  LEGACY_KEYS.forEach((key) => {
    if (key in bag) {
      delete bag[key]
      changed = true
    }
  })
  return changed
}

/** 本单施工项目（交车清单的行源）：施工节点草稿 findings → 已定稿 workItems */
function workItemsOf(nodes) {
  const rows = []
  ;(Array.isArray(nodes) ? nodes : []).forEach((node) => {
    if (!node || node.kind !== 'work') return
    ;[node.content, node.photoDraft].forEach((bag) => {
      if (!bag || typeof bag !== 'object') return
      ;(Array.isArray(bag.findings) ? bag.findings : []).forEach((row) => {
        const name = text(row && (row.partName || row.name))
        if (name) rows.push({ name })
      })
    })
    const payload = (node.document && node.document.payload) || {}
    ;(Array.isArray(payload.workItems) ? payload.workItems : []).forEach((row) => {
      const name = text(row && (row.partName || row.name))
      if (name) rows.push({ name })
    })
  })
  return rows
}

/**
 * workItems 传数组：草稿箱按施工项目重建行（旧汇总行「整体验收」不再保留）；
 * workItems 传 null：历史定稿报告只归一行结构，不改行集合（车主已确认的单据不重排）。
 */
function migrateBag(bag, mark, workItems = null, stats = null) {
  if (!bag || typeof bag !== 'object') return false
  const legacyPhotos = []
  if (bag.deliveryExteriorUrl) legacyPhotos.push(bag.deliveryExteriorUrl)
  if (Array.isArray(bag.selectedDeliveryUrls)) legacyPhotos.push(...bag.selectedDeliveryUrls)
  if (Array.isArray(bag.deliveryPhotos)) legacyPhotos.push(...bag.deliveryPhotos)

  const legacyRows = legacyAcceptanceRows(bag.acceptance)
  const currentRows = Array.isArray(bag.acceptanceItems) ? bag.acceptanceItems : []
  const sourceRows = currentRows.length ? currentRows : legacyRows
  if (!sourceRows.length && !legacyPhotos.length && !LEGACY_KEYS.some((key) => key in bag)) {
    return false
  }

  const normalized = normalizeAcceptanceRows(sourceRows)
  const rebuilt = Array.isArray(workItems)
    ? buildAcceptanceRowsFromWorkItems(workItems, normalized)
    : normalized
  if (stats && Array.isArray(workItems)) {
    const kept = {}
    rebuilt.forEach((row) => {
      kept[row.name] = true
    })
    stats.droppedRows += normalized.filter((row) => row.kind === 'work' && !kept[row.name]).length
  }
  const nextRows = ensureExteriorRow(rebuilt, legacyPhotos)
  if (JSON.stringify(nextRows) !== JSON.stringify(currentRows)) {
    bag.acceptanceItems = nextRows
    mark()
  }
  if (sourceRows.length && !nextRows.length) {
    delete bag.acceptanceItems
    mark()
  }
  return stripLegacyAcceptanceKeys(bag)
}

function migratePackage(pkg) {
  if (!pkg || typeof pkg !== 'object') return { pkg, changed: false, stats: {} }
  let changed = false
  const stats = { nodes: 0, reports: 0, exteriorRows: 0, droppedRows: 0, archiveCopy: 0 }
  const mark = () => {
    changed = true
  }
  const nodes = Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []
  const workItems = workItemsOf(nodes)
  nodes.forEach((node) => {
    if (!node || typeof node !== 'object') return
    if (node.kind === 'delivery_photos') {
      const content = node.content && typeof node.content === 'object' ? node.content : null
      const draft = node.photoDraft && typeof node.photoDraft === 'object' ? node.photoDraft : null
      const contentTouched = content ? migrateBag(content, mark, workItems, stats) : false
      const draftTouched = draft ? migrateBag(draft, mark, workItems, stats) : false
      if (contentTouched || draftTouched) {
        stats.nodes += 1
        changed = true
      }
    }
    if (node.kind === 'repair_report' && node.document && node.document.payload) {
      const payload = node.document.payload
      const before = JSON.stringify(payload)
      // 历史定稿报告：只归一行结构，不按施工项重排名（车主已确认）
      migrateBag(payload, mark, null, stats)
      if (JSON.stringify(payload) !== before) {
        changed = true
        stats.reports += 1
      }
    }
  })

  // archiveCopy 一次性迁入交车节点 content（只补空）
  const copy = pkg.archiveCopy && typeof pkg.archiveCopy === 'object' ? pkg.archiveCopy : null
  if (copy) {
    const delivery = nodes.find((node) => node && node.kind === 'delivery_photos')
    if (delivery) {
      const content = delivery.content && typeof delivery.content === 'object' ? delivery.content : {}
      const summary = text(copy.summary || copy.aiSummary)
      if (summary && !text(content.repairBrief)) {
        content.repairBrief = summary.slice(0, 500)
        delivery.content = content
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
        delivery.content = content
        changed = true
      }
      if (changed) stats.archiveCopy = 1
    }
  }
  if (changed && pkg.archiveCopy) delete pkg.archiveCopy

  // 统计外观行数量，方便核对迁移量
  nodes.forEach((node) => {
    const bags = []
    if (node && node.content) bags.push(node.content)
    if (node && node.photoDraft) bags.push(node.photoDraft)
    if (node && node.document && node.document.payload) bags.push(node.document.payload)
    bags.forEach((bag) => {
      ;(Array.isArray(bag && bag.acceptanceItems) ? bag.acceptanceItems : []).forEach((row) => {
        if (row && row.kind === 'exterior') stats.exteriorRows += 1
      })
    })
  })
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

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('[migrate-delivery-acceptance] failed', err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}

module.exports = { migratePackage, normalizeAcceptanceRows, ensureExteriorRow, mergeNote }
