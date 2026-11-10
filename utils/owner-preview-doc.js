/**
 * 发给车主前的预览：字段与车主单据同一张，不另做摘要。
 */
const { ownerFindingResultLabel, REPAIR_CONFIRM_COPY } = require('../constants/service-flow-nodes')
const { quoteFace, resolveQuoteConfirmCopy } = require('./service-flow-quote-draft')

function photoRows(list) {
  const rows = []
  ;(Array.isArray(list) ? list : []).forEach((item) => {
    const url = typeof item === 'string' ? item : item && (item.url || item.src)
    const text = String(url || '').trim()
    if (!text || rows.some((row) => row.url === text)) return
    rows.push({ url: text })
  })
  return rows
}

function moneySum(lines) {
  return (lines || []).reduce((sum, line) => {
    const n = Number(line && line.amount)
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
}

function quoteRows(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => {
      const evidenceUrls = []
      const list = Array.isArray(line && line.evidenceUrls) ? line.evidenceUrls : []
      list.concat(line && line.evidenceUrl ? [line.evidenceUrl] : []).forEach((item) => {
        const url = String((typeof item === 'string' ? item : item && item.url) || '').trim()
        if (url && evidenceUrls.indexOf(url) < 0) evidenceUrls.push(url)
      })
      return {
        name: String((line && line.name) || '').trim(),
        brand: String((line && line.brand) || '').trim(),
        note: String((line && line.note) || '').trim(),
        amount: line && line.amount != null ? line.amount : '',
        evidenceUrls,
      }
    })
    .filter((line) => line.name)
}

function findingRows(findings) {
  return (Array.isArray(findings) ? findings : [])
    .map((row) => ({
      partName: String((row && row.partName) || '').trim(),
      result: ownerFindingResultLabel((row && row.result) || ''),
      advice: String((row && (row.advice || row.caption)) || '').trim(),
      images: photoRows((row && row.images) || (row && row.url ? [row.url] : [])),
    }))
    .filter((row) => row.partName || row.advice || row.images.length)
}

function looksMaskedPlate(plate) {
  return /\*{2,}/.test(String(plate || ''))
}

function previewAlbumOf(album = {}) {
  const vehicle = (album && (album.vehicle || album.vehicleJson)) || {}
  const store = (album && album.store) || {}
  return {
    storeName: String((album && (album.storeName || store.name)) || '').trim(),
    templateId: String((album && album.templateId) || '').trim(),
    serviceName: String((album && album.serviceName) || '').trim(),
    vehicle,
  }
}

function workItemsFromFindings(findings = []) {
  return (Array.isArray(findings) ? findings : [])
    .map((row) => ({
      name: String((row && (row.partName || row.name)) || '').trim(),
      brand: String((row && row.brand) || '').trim(),
      material: String((row && row.material) || '').trim(),
      qty: String((row && row.qty) || '').trim(),
      note: String((row && (row.caption || row.note)) || '').trim(),
      images: photoRows((row && row.images) || (row && row.url ? [row.url] : [])),
      amount: row && row.amount != null ? row.amount : '',
      quoteLineId: String((row && row.quoteLineId) || '').trim(),
    }))
    .filter((row) => row.name)
}

function quoteTotalsFromNodes(nodes = []) {
  const quoteByName = {}
  let quoteTotal = 0
  ;(nodes || []).forEach((node) => {
    if (!node || (node.kind !== 'quote_confirm' && node.kind !== 'addon_quote_confirm')) return
    const status = String((node.document && node.document.status) || '')
    if (status === 'cancelled') return
    const lines =
      (node.document && node.document.payload && node.document.payload.lines) || []
    lines.forEach((line) => {
      const name = String((line && line.name) || '').trim()
      const amount = Number(line && line.amount)
      if (!name || !Number.isFinite(amount)) return
      quoteByName[name] = (quoteByName[name] || 0) + amount
      quoteTotal += amount
    })
  })
  return { quoteByName, quoteTotal }
}

function finishWorkItemsFromFindingsList(findingsList = [], quoteByName = {}) {
  const workItems = []
  ;(Array.isArray(findingsList) ? findingsList : []).forEach((findings) => {
    workItemsFromFindings(findings).forEach((item) => {
      const own = Number(item.amount)
      const fromQuote = quoteByName[item.name]
      workItems.push({
        name: item.name,
        brand: item.brand,
        note: item.note,
        amount: Number.isFinite(own) && own > 0 ? own : fromQuote != null ? fromQuote : '',
      })
    })
  })
  return workItems
}

/** 外观照（交车页单独一块）：草稿/实时都以 deliveryPhotos 为准 */
function deliveryPhotosFromDraft(draft = {}, live = {}) {
  const useLive = Boolean(live && live.useLive && Array.isArray(live.photos) && live.photos.length)
  const list = useLive ? live.photos : Array.isArray(draft && draft.deliveryPhotos) ? draft.deliveryPhotos : []
  const deliveryPhotos = []
  const seen = {}
  list.forEach((row) => {
    const text = String((row && (row.url || row.rawUrl)) || row || '').trim()
    if (!text || seen[text]) return
    seen[text] = true
    deliveryPhotos.push({ url: text })
  })
  return deliveryPhotos
}

function formatClerkAtForDoc(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (iso) {
    return `${Number(iso[2])}月${Number(iso[3])}日 ${iso[4] || '00'}:${iso[5] || '00'}`
  }
  const cn = raw.match(/^(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2}):(\d{2}))?/)
  if (cn) {
    const time = cn[3] != null ? `${String(Number(cn[3])).padStart(2, '0')}:${cn[4] || '00'}` : ''
    return `${Number(cn[1])}月${Number(cn[2])}日${time ? ` ${time}` : ''}`
  }
  return raw
}

/** 交给车主的单据用完整车牌。展示号是打码后的，只在没有明文时才用。 */
function albumMetaLine(album, mileageText) {
  const vehicle = (album && album.vehicle) || {}
  const full = String(vehicle.plate || vehicle.plateNumber || '').trim()
  const display = String(vehicle.plateDisplay || '').trim()
  const plate =
    (full && !looksMaskedPlate(full) && full) ||
    (display && !looksMaskedPlate(display) && display) ||
    full ||
    display
  const name = [vehicle.brand, vehicle.series, vehicle.model]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
  return [plate, name, String(mileageText || '').trim()].filter(Boolean).join(' · ')
}

/**
 * 接车报告入店照片：未发出跟留证；已发出只认定稿 photos。
 * 旧册缺定稿时由库侧一次收回，读侧不再用编辑底稿补洞。
 */
function intakePhotoRowsFromContent(content = {}, options = {}) {
  const issued = Boolean(options.issued)
  const sealed = photoRows(content && content.photos)
  if (issued) return sealed
  const pending = photoRows(content && content.pendingImages)
  return pending.length ? pending : sealed
}

/** 商家预览与车主打开共用：从节点内容拼接车报告 */
function buildIntakePreviewFromContent(content = {}, album = {}, options = {}) {
  const bag = content && typeof content === 'object' ? content : {}
  const issued = Boolean(options.issued)
  const mileageText = String(options.mileageText || '').trim()
  return buildOwnerPreviewDoc({
    family: 'intake',
    album: previewAlbumOf(album),
    chiefComplaint: String(bag.chiefComplaint || '').trim(),
    photos: intakePhotoRowsFromContent(bag, { issued }),
    mileageText,
    belongings: String(bag.belongings || '').trim(),
    fuelReading: String(bag.fuelReading || '').trim(),
    signName: String(options.signName != null ? options.signName : bag.receiverName || '').trim(),
    signAt: formatClerkAtForDoc(
      options.signAt != null ? options.signAt : bag.receivedAt || '',
    ),
  })
}

function buildOwnerPreviewDoc(input = {}) {
  const family = String(input.family || '')
  const album = input.album || {}
  const storeName = String(album.storeName || '').trim()
  const signName = String(input.signName || '').trim()
  const signAt = String(input.signAt || '').trim()
  const signLabel = String(input.signLabel || '').trim()
  const signAtLabel = String(input.signAtLabel || '').trim()
  const metaLine = albumMetaLine(album, input.mileageText)
  const face = quoteFace({
    templateId: album.templateId,
    serviceName: album.serviceName || '',
  })
  if (family === 'intake') {
    const photos = photoRows(input.photos)
    const chiefComplaint = String(input.chiefComplaint || '').trim()
    const doc = {
      kind: 'intake',
      title: '接车报告',
      styleVariant: 'document',
      storeName,
      chiefComplaint,
      // 里程只在 metaLine，正文不再重复 mileageText
      mileageText: '',
      fuelReading: String(input.fuelReading || '').trim(),
      belongings: String(input.belongings || '').trim(),
      photos,
      needsConfirm: false,
      metaLine,
      signLabel: signLabel || '接车人',
      signName,
      signAtLabel: signAtLabel || '时间',
      signAt,
    }
    return {
      doc,
      quoteLines: [],
      hasBody: Boolean(
        chiefComplaint ||
          photos.length ||
          String(input.mileageText || '').trim() ||
          doc.fuelReading ||
          doc.belongings,
      ),
    }
  }
  if (family === 'inspect') {
    const findings = findingRows(input.findings)
    const chiefComplaint = String(input.chiefComplaint || '').trim()
    return {
      doc: {
        kind: 'inspection_report',
        title: '检测报告',
        styleVariant: 'evidence',
        storeName,
        chiefComplaint,
        findings,
        conclusion: '',
        needsConfirm: false,
        metaLine,
        signLabel: signLabel || '检测人',
        signName,
        signAtLabel: signAtLabel || '时间',
        signAt,
      },
      quoteLines: quoteRows(input.quoteLines),
      hasBody: Boolean(findings.length || chiefComplaint),
    }
  }
  if (family === 'quote') {
    const lines = quoteRows(input.lines)
    const discoveryImages = photoRows(input.discoveryImages).map((row) => row.url)
    const discoveryNote = String(input.discoveryNote || '').trim()
    const isAddon = Boolean(input.isAddon)
    const total = moneySum(lines)
    return {
      doc: {
        kind: isAddon ? 'addon_quote_confirm' : 'quote_confirm',
        title: isAddon ? face.addonTitle : '报价单',
        styleVariant: 'document',
        storeName,
        isAddon,
        lines,
        discoveryNote,
        discoveryImages,
        totalAmountLabel: lines.length ? `合计 ¥${total.toFixed(2)}` : '',
        confirmCopy: resolveQuoteConfirmCopy({
          templateId: album.templateId,
          serviceName: album.serviceName || '',
        }),
        needsConfirm: false,
        metaLine,
      },
      quoteLines: [],
      hasBody: Boolean(lines.length || discoveryNote || discoveryImages.length),
    }
  }
  if (family === 'work') {
    const items = (Array.isArray(input.workItems) ? input.workItems : [])
      .map((row) => ({
        name: String((row && row.name) || '').trim(),
        brand: String((row && row.brand) || '').trim(),
        material: String((row && row.material) || '').trim(),
        qty: String((row && row.qty) || '').trim(),
        note: String((row && row.note) || '').trim(),
        images: photoRows((row && row.images) || []),
      }))
      .filter((row) => row.name)
    return {
      doc: {
        kind: 'work',
        title: '维修工单',
        styleVariant: 'document',
        storeName,
        items,
        needsConfirm: false,
        metaLine,
        signLabel: signLabel || '施工人',
        signName,
        signAtLabel: signAtLabel || '完工时间',
        signAt,
      },
      quoteLines: [],
      hasBody: Boolean(items.length || signName || signAt),
    }
  }
  if (family === 'finish') {
    const workItems = (Array.isArray(input.workItems) ? input.workItems : [])
      .map((row) => ({
        name: String((row && (row.name || row.partName)) || '').trim(),
        brand: String((row && row.brand) || '').trim(),
        note: String((row && (row.note || row.caption)) || '').trim(),
        amount: row && row.amount != null ? row.amount : '',
      }))
      .filter((row) => row.name)
    const deliveryPhotos = photoRows(input.deliveryPhotos)
    const warrantyPeriod = String(input.warrantyPeriod || '').trim()
    const warrantyNotes = String(input.warrantyNotes || '').trim()
    // 验收项（2026-11-10 定稿）：按施工项目逐项；不做旧结构兼容（旧数据由迁移脚本搬完）
    const acceptanceLabels = { pass: '合格', observe: '建议观察', rework: '需返工' }
    const acceptanceTones = { pass: 'pass', observe: 'observe', rework: 'rework' }
    const acceptanceItems = (Array.isArray(input.acceptanceItems) ? input.acceptanceItems : [])
      .map((row, index) => {
        const obj = row && typeof row === 'object' ? row : {}
        const name = String(obj.name || '').trim()
        if (!name) return null
        const result = ['pass', 'observe', 'rework'].includes(obj.result) ? obj.result : ''
        return {
          id: String(obj.id || `acc_${index + 1}`),
          name,
          standard: String(obj.standard || '').trim(),
          method: String(obj.method || '').trim(),
          note: String(obj.note || '').trim(),
          images: photoRows(obj.images),
          result,
          resultLabel: result ? acceptanceLabels[result] : '',
          resultTone: result ? acceptanceTones[result] : '',
        }
      })
      .filter(Boolean)
    const lineTotal = moneySum(workItems)
    const quoted = Number(input.totalAmount)
    const total = Number.isFinite(quoted) && quoted > 0 ? quoted : lineTotal
    return {
      doc: {
        kind: 'repair_report',
        title: '交车报告',
        styleVariant: 'document',
        storeName,
        acceptanceItems,
        workItems,
        deliveryPhotos,
        warrantyPeriod,
        warrantyNotes,
        totalAmountLabel: workItems.length ? `合计 ¥${total.toFixed(2)}` : '',
        confirmCopy: REPAIR_CONFIRM_COPY,
        needsConfirm: false,
        metaLine,
        signLabel: signLabel || '交付人',
        signName,
        signAt,
        signAtLabel: signAtLabel || '完工时间',
      },
      quoteLines: [],
      hasBody: Boolean(
        acceptanceItems.length ||
          workItems.length ||
          deliveryPhotos.length ||
          warrantyPeriod ||
          warrantyNotes,
      ),
    }
  }
  return { doc: null, quoteLines: [], hasBody: false }
}

module.exports = {
  buildOwnerPreviewDoc,
  buildIntakePreviewFromContent,
  intakePhotoRowsFromContent,
  previewAlbumOf,
  workItemsFromFindings,
  quoteTotalsFromNodes,
  finishWorkItemsFromFindingsList,
  deliveryPhotosFromDraft,
  formatClerkAtForDoc,
}
