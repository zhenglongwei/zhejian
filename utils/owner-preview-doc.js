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

function buildOwnerPreviewDoc(input = {}) {
  const family = String(input.family || '')
  const album = input.album || {}
  const storeName = String(album.storeName || '').trim()
  const face = quoteFace({
    templateId: album.templateId,
    serviceName: album.serviceName || '',
  })
  if (family === 'intake') {
    const photos = photoRows(input.photos)
    const chiefComplaint = String(input.chiefComplaint || '').trim()
    const doc = {
      kind: 'intake',
      title: '接车照片',
      styleVariant: 'document',
      storeName,
      chiefComplaint,
      mileageText: String(input.mileageText || '').trim(),
      fuelReading: String(input.fuelReading || '').trim(),
      belongings: String(input.belongings || '').trim(),
      photos,
      needsConfirm: false,
    }
    return {
      doc,
      quoteLines: [],
      hasBody: Boolean(chiefComplaint || photos.length || doc.mileageText || doc.fuelReading || doc.belongings),
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
        title: isAddon ? face.addonTitle : face.heroLabel,
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
      },
      quoteLines: [],
      hasBody: Boolean(lines.length || discoveryNote || discoveryImages.length),
    }
  }
  if (family === 'finish') {
    const workItems = (Array.isArray(input.workItems) ? input.workItems : [])
      .map((row) => ({
        name: String((row && row.name) || '').trim(),
        brand: String((row && row.brand) || '').trim(),
        note: String((row && row.note) || '').trim(),
        amount: row && row.amount != null ? row.amount : '',
      }))
      .filter((row) => row.name)
    const deliveryPhotos = photoRows(input.deliveryPhotos)
    const warrantyPeriod = String(input.warrantyPeriod || '').trim()
    const warrantyNotes = String(input.warrantyNotes || '').trim()
    const total = moneySum(workItems)
    return {
      doc: {
        kind: 'repair_report',
        title: '交车报告',
        styleVariant: 'document',
        storeName,
        workItems,
        deliveryPhotos,
        warrantyPeriod,
        warrantyNotes,
        totalAmountLabel: workItems.length ? `合计 ¥${total.toFixed(2)}` : '',
        confirmCopy: REPAIR_CONFIRM_COPY,
        needsConfirm: false,
      },
      quoteLines: [],
      hasBody: Boolean(workItems.length || deliveryPhotos.length || warrantyPeriod || warrantyNotes),
    }
  }
  return { doc: null, quoteLines: [], hasBody: false }
}

module.exports = {
  buildOwnerPreviewDoc,
}
