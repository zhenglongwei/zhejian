/**
 * GEO 专题工作台 · 相关案例包导出（供外部大模型写专题，不含原图）
 */
const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')

function toIso(value) {
  if (!value) return ''
  try {
    return new Date(value).toISOString()
  } catch {
    return ''
  }
}

function extractPlanParts(snapshot = {}, enrichment = {}) {
  const fromSnap = Array.isArray(snapshot.planParts) ? snapshot.planParts : []
  if (fromSnap.length) return fromSnap
  const fromEnrich = Array.isArray(enrichment.planParts) ? enrichment.planParts : []
  return fromEnrich
}

function summarizeCase(row) {
  const content =
    row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  const snapshot =
    content.snapshot && typeof content.snapshot === 'object'
      ? content.snapshot
      : content
  const enrichment =
    row.enrichmentJson && typeof row.enrichmentJson === 'object' ? row.enrichmentJson : {}
  const planParts = extractPlanParts(snapshot, enrichment)
    .slice(0, 20)
    .map((part) => ({
      name: String(part.name || '').trim(),
      partType: String(part.partType || '').trim(),
      partBrand: String(part.partBrand || '').trim(),
      qty: part.qty != null ? Number(part.qty) : 1,
      unitPrice: part.unitPrice != null ? Number(part.unitPrice) : null,
      lineTotal: part.lineTotal != null ? Number(part.lineTotal) : null,
    }))
    .filter((part) => part.name)

  const planAmount =
    row.maxAmount != null
      ? row.maxAmount
      : snapshot.planAmount != null
        ? snapshot.planAmount
        : null

  const missing = []
  if (!planParts.length) missing.push('配件明细')
  if (planAmount == null) missing.push('方案金额')
  if (!String(row.aiSummary || row.summary || '').trim()) missing.push('摘要')

  return {
    caseId: row.id,
    title: row.title || '',
    city: row.city || '',
    serviceName: row.serviceName || '',
    storeName: row.storeName || '',
    priceMode: row.priceMode || '',
    minAmount: row.minAmount,
    maxAmount: row.maxAmount,
    planAmount,
    summary: String(row.summary || '').trim(),
    aiSummary: String(row.aiSummary || '').trim(),
    planParts,
    publishedAt: toIso(row.publishedAt),
    h5Path: row.canonicalPath || (row.slug ? `/case/${row.slug}.html` : ''),
    missingFields: missing,
  }
}

function buildMarkdown(pack) {
  const lines = []
  lines.push(`# 辙见案例包导出`)
  lines.push('')
  lines.push(`- 导出时间：${pack.exportedAt}`)
  lines.push(`- 筛选：城市=${pack.filters.city || '不限'}；服务=${pack.filters.serviceName || '不限'}`)
  lines.push(`- 案例数：${pack.cases.length}`)
  lines.push('')
  lines.push('> 仅含已审核公开摘要与已确认结构化字段，**不含**单据原图与未脱敏原文。请用于外部大模型撰写专题初稿，定稿后回填运营台。')
  lines.push('')

  pack.cases.forEach((item, index) => {
    lines.push(`## ${index + 1}. ${item.title || item.caseId}`)
    lines.push('')
    lines.push(`- 城市：${item.city || '—'}`)
    lines.push(`- 服务：${item.serviceName || '—'}`)
    lines.push(`- 门店：${item.storeName || '—'}`)
    if (item.planAmount != null) lines.push(`- 方案参考价：¥${item.planAmount}`)
    else if (item.minAmount != null || item.maxAmount != null) {
      lines.push(`- 参考区间：¥${item.minAmount ?? '—'}–¥${item.maxAmount ?? '—'}`)
    }
    if (item.h5Path) lines.push(`- 页面：${item.h5Path}`)
    if (item.missingFields.length) {
      lines.push(`- 缺字段提醒：${item.missingFields.join('、')}`)
    }
    lines.push('')
    if (item.aiSummary || item.summary) {
      lines.push('### 摘要')
      lines.push(item.aiSummary || item.summary)
      lines.push('')
    }
    if (item.planParts.length) {
      lines.push('### 配件/项目（已审）')
      item.planParts.forEach((part) => {
        const price =
          part.lineTotal != null
            ? ` ¥${part.lineTotal}`
            : part.unitPrice != null
              ? ` ¥${part.unitPrice}`
              : ''
        lines.push(
          `- ${part.name}${part.partType ? `（${part.partType}` : ''}${
            part.partBrand ? `${part.partType ? ' · ' : '（'}${part.partBrand}` : ''
          }${part.partType || part.partBrand ? '）' : ''} ×${part.qty || 1}${price}`,
        )
      })
      lines.push('')
    }
  })

  lines.push('## 写作提示（给外部大模型）')
  lines.push('')
  lines.push('1. 只使用上文已给出的事实；缺字段处不要编造配件单价或定损明细。')
  lines.push('2. 提炼共性与差异，写 FAQ 与服务说明；价格表述须标明「参考 / 以到店检测为准」。')
  lines.push('3. 禁止好评返现、全网最低、100% 修好、事故车线上最终报价等违规承诺。')
  lines.push('')

  return lines.join('\n')
}

async function exportGeoCasePack(query = {}) {
  const city = String(query.city || '').trim()
  const serviceName = String(query.serviceName || '').trim()
  const keyword = String(query.keyword || '').trim()
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20))

  const where = {
    status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
  }
  if (city) where.city = { contains: city }
  if (serviceName) where.serviceName = { contains: serviceName }
  if (keyword) {
    where.OR = [
      { title: { contains: keyword } },
      { summary: { contains: keyword } },
      { aiSummary: { contains: keyword } },
    ]
  }

  const rows = await prisma.publicCase.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  })

  const cases = rows.map(summarizeCase)
  const pack = {
    exportedAt: new Date().toISOString(),
    filters: { city, serviceName, keyword, limit },
    caseCount: cases.length,
    cases,
  }

  return {
    ...pack,
    markdown: buildMarkdown(pack),
    disclaimer:
      '案例包仅含公开摘要与已审结构化字段，不含单据原图。供外部工具撰写专题，勿将未脱敏内容外发。',
  }
}

module.exports = {
  exportGeoCasePack,
  summarizeCase,
  buildMarkdown,
}
