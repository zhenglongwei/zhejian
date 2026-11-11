/**
 * GEO-FACTS-01 · 案例事实 JSON-LD 块（机器友好，供 AI 抓取引用）
 * 口径：docs/15 §证据分级 / docs/09 GEO 基础设施。
 *
 * 设计要点：
 * 1. **纯函数**：只吃 getCaseDetail 的 data（含 serviceFlow.chapters / caseVehicle / trustMeta），不碰 DB
 * 2. 独立 @graph：Article @id 与主 schema-graph 互链合并；车辆事实用 Car 实体（about 挂链）
 * 3. 事实以 schema.org PropertyValue 呈现（name 用 facts.* 命名空间），与店页 transparency.* 同风格
 * 4. 只放公开侧已有的事实（脱敏、无金额），不新增暴露面；缺图等诚实标注原样输出
 */

const { entityId, normalizeBase } = require('./schema-graph')

const FACT_LIMITS = { findings: 8, quoteItems: 10, workItems: 10, acceptanceItems: 10 }

function text(value) {
  return String(value || '').trim()
}

function isBlankWarranty(value) {
  const bare = text(value).replace(/[。．.]$/, '')
  return !bare || bare === '无' || bare === '暂无' || bare === '没有' || bare === '无备注'
}

function prop(name, value, description) {
  const clean = text(value)
  if (!clean) return null
  const row = { '@type': 'PropertyValue', name, value: clean }
  const desc = text(description)
  if (desc) row.description = desc
  return row
}

function collectFromChapters(chapters) {
  const out = {
    chiefComplaint: '',
    findings: [],
    quoteItems: [],
    workItems: [],
    acceptanceItems: [],
    warrantyPeriod: '',
    warrantyNotes: '',
    exteriorPhotoWaived: false,
  }
  ;(Array.isArray(chapters) ? chapters : []).forEach((chapter) => {
    if (!chapter || typeof chapter !== 'object') return
    if (chapter.kind === 'inspection_report') {
      if (!out.chiefComplaint) out.chiefComplaint = text(chapter.chiefComplaint)
      ;(Array.isArray(chapter.findings) ? chapter.findings : []).forEach((row) => {
        if (!row || typeof row !== 'object') return
        const partName = text(row.partName)
        const result = text(row.result)
        const advice = text(row.advice)
        if (!partName && !result && !advice) return
        out.findings.push({ partName, result, advice })
      })
    }
    if (chapter.kind === 'quote_confirm' || chapter.kind === 'addon_quote_confirm') {
      ;(Array.isArray(chapter.items) ? chapter.items : []).forEach((row) => {
        if (!row || typeof row !== 'object') return
        const name = text(row.name)
        if (!name) return
        out.quoteItems.push({ name, brand: text(row.brand), note: text(row.note) })
      })
    }
    if (chapter.kind === 'work') {
      ;(Array.isArray(chapter.items) ? chapter.items : []).forEach((row) => {
        if (!row || typeof row !== 'object') return
        const name = text(row.name)
        if (!name) return
        out.workItems.push({ name, brand: text(row.brand), note: text(row.note) })
      })
    }
    if (chapter.kind === 'repair_report') {
      ;(Array.isArray(chapter.acceptanceItems) ? chapter.acceptanceItems : []).forEach((row) => {
        if (!row || typeof row !== 'object') return
        const name = text(row.name)
        if (!name) return
        out.acceptanceItems.push({
          name,
          kind: row.kind === 'exterior' ? 'exterior' : 'work',
          resultLabel: text(row.resultLabel),
          note: text(row.note),
          missingPhoto: row.missingPhoto === true,
        })
      })
      if (!out.warrantyPeriod) out.warrantyPeriod = text(chapter.warrantyPeriod)
      if (!out.warrantyNotes) out.warrantyNotes = text(chapter.warrantyNotes)
      if (chapter.exteriorPhotoWaived === true) out.exteriorPhotoWaived = true
    }
  })
  return out
}

function buildVehicleNode({ data, facts, vehicleId }) {
  const vehicle = data.caseVehicle && typeof data.caseVehicle === 'object' ? data.caseVehicle : {}
  const brand = text(vehicle.brand)
  const series = text(vehicle.series)
  const year = text(vehicle.year)
  const mileageText = text(vehicle.mileageText)
  const mileageKm = Number(data.mileageKm != null ? data.mileageKm : data.vehicleMileage)
  const hasAny =
    brand || series || year || mileageText || (Number.isFinite(mileageKm) && mileageKm > 0)
  if (!hasAny) return null
  const node = {
    '@type': 'Car',
    '@id': vehicleId,
    name: [year, brand, series].filter(Boolean).join(' ') || text(data.vehicleText) || '送修车辆',
  }
  if (brand) node.brand = brand
  if (series) node.model = series
  if (year) node.vehicleModelDate = year
  if (Number.isFinite(mileageKm) && mileageKm > 0) {
    node.mileageFromOdometer = {
      '@type': 'QuantitativeValue',
      value: mileageKm,
      unitText: 'Km',
    }
  }
  return node
}

/**
 * @param {object} input
 * @param {string} input.baseUrl
 * @param {string} input.canonicalPath 案例页规范路径
 * @param {object} input.data getCaseDetail 返回的案例数据
 * @returns {object|null} JSON-LD 块；无事实时返回 null（调用方跳过注入）
 */
function buildCaseFactsSchema(input = {}) {
  const base = normalizeBase(input.baseUrl)
  const data = input.data || {}
  const canonicalPath =
    input.canonicalPath ||
    (data.canonicalPath || (data.seo && data.seo.canonicalPath) || '')
  if (!canonicalPath) return null

  const facts = collectFromChapters(data.serviceFlow && data.serviceFlow.chapters)
  const trustMeta = data.trustMeta && typeof data.trustMeta === 'object' ? data.trustMeta : null

  const articleId = entityId(base, canonicalPath, 'article')
  const vehicleId = entityId(base, canonicalPath, 'vehicle')
  const vehicleNode = buildVehicleNode({ data, facts, vehicleId })

  const props = []
  const chiefComplaint = text(data.chiefComplaint) || facts.chiefComplaint
  if (chiefComplaint) props.push(prop('facts.chiefComplaint', chiefComplaint))

  facts.findings.slice(0, FACT_LIMITS.findings).forEach((row) => {
    const value = [row.partName, row.result, row.advice].filter(Boolean).join(' · ')
    props.push(prop('facts.finding', value, row.partName))
  })

  facts.quoteItems.slice(0, FACT_LIMITS.quoteItems).forEach((row) => {
    const value = [row.name, row.brand, row.note].filter(Boolean).join(' · ')
    props.push(prop('facts.quoteItem', value, row.name))
  })

  facts.workItems.slice(0, FACT_LIMITS.workItems).forEach((row) => {
    const value = [row.name, row.brand, row.note].filter(Boolean).join(' · ')
    props.push(prop('facts.workItem', value, row.name))
  })

  facts.acceptanceItems.slice(0, FACT_LIMITS.acceptanceItems).forEach((row) => {
    const bits = [row.name, row.resultLabel, row.note].filter(Boolean)
    if (row.missingPhoto) bits.push('商家未留外观照')
    props.push(prop('facts.acceptanceItem', bits.join(' · '), row.name))
  })

  if (!isBlankWarranty(facts.warrantyPeriod)) {
    props.push(prop('facts.warrantyPeriod', facts.warrantyPeriod))
  }
  if (!isBlankWarranty(facts.warrantyNotes)) {
    props.push(prop('facts.warrantyNotes', facts.warrantyNotes))
  }
  if (facts.exteriorPhotoWaived) {
    props.push(prop('facts.exteriorPhotoWaived', 'true', '商家定稿时确认未拍摄外观照'))
  }
  if (trustMeta) {
    if (text(trustMeta.evidenceLevel)) {
      props.push(prop('evidenceLevel', trustMeta.evidenceLevel))
    }
    if (text(trustMeta.evidenceLevelLabel)) {
      props.push(prop('evidenceLevelLabel', trustMeta.evidenceLevelLabel))
    }
  }

  if (!props.length && !vehicleNode) return null

  const factsArticle = {
    '@type': 'Article',
    '@id': articleId,
    additionalProperty: props,
  }
  if (vehicleNode) factsArticle.about = { '@id': vehicleId }

  const graph = []
  if (vehicleNode) graph.push(vehicleNode)
  graph.push(factsArticle)

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
}

module.exports = {
  buildCaseFactsSchema,
  collectFromChapters,
}
