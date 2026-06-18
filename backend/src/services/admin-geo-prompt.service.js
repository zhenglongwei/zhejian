/**
 * GEO-OBS-B03 · Prompt 词库运营 CRUD
 */
const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')

function mapPromptRow(row) {
  if (!row) return null
  return {
    id: row.id,
    promptId: row.promptId,
    prompt: row.prompt,
    city: row.city || '',
    service: row.service || '',
    fault: row.fault || '',
    topicSlug: row.topicSlug || '',
    pageType: row.pageType || '',
    promptType: row.promptType || 'B',
    source: row.source || '',
    active: Boolean(row.active),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function listAdminGeoPrompts(query = {}) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(Math.max(Number(query.pageSize) || 20, 1), 100)
  const where = {}
  if (query.active === 'true') where.active = true
  if (query.active === 'false') where.active = false
  if (query.keyword) {
    const keyword = String(query.keyword).trim()
    where.OR = [
      { prompt: { contains: keyword } },
      { promptId: { contains: keyword } },
      { topicSlug: { contains: keyword } },
      { city: { contains: keyword } },
    ]
  }

  const [rows, total] = await Promise.all([
    prisma.geoPromptProbe.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.geoPromptProbe.count({ where }),
  ])

  return {
    list: rows.map(mapPromptRow),
    total,
    page,
    pageSize,
  }
}

async function getAdminGeoPrompt(promptId) {
  const row = await prisma.geoPromptProbe.findFirst({
    where: {
      OR: [{ promptId: String(promptId) }, { id: String(promptId) }],
    },
  })
  if (!row) {
    const err = new Error('Prompt 不存在')
    err.status = 404
    throw err
  }
  return mapPromptRow(row)
}

async function createAdminGeoPrompt(payload = {}) {
  const promptId = String(payload.promptId || '').trim()
  const prompt = String(payload.prompt || '').trim()
  if (!promptId || !prompt) {
    const err = new Error('promptId 与 prompt 必填')
    err.status = 400
    throw err
  }
  const existing = await prisma.geoPromptProbe.findUnique({ where: { promptId } })
  if (existing) {
    const err = new Error('promptId 已存在')
    err.status = 409
    throw err
  }

  const row = await prisma.geoPromptProbe.create({
    data: {
      id: newId('gpp'),
      promptId,
      prompt,
      city: String(payload.city || '').trim(),
      service: String(payload.service || '').trim(),
      fault: String(payload.fault || '').trim(),
      topicSlug: String(payload.topicSlug || '').trim(),
      pageType: String(payload.pageType || '').trim(),
      promptType: String(payload.promptType || 'B').trim(),
      source: String(payload.source || 'manual').trim(),
      active: payload.active !== false,
    },
  })
  return mapPromptRow(row)
}

async function updateAdminGeoPrompt(promptId, payload = {}) {
  const row = await prisma.geoPromptProbe.findFirst({
    where: {
      OR: [{ promptId: String(promptId) }, { id: String(promptId) }],
    },
  })
  if (!row) {
    const err = new Error('Prompt 不存在')
    err.status = 404
    throw err
  }

  const data = {}
  if (payload.prompt != null) data.prompt = String(payload.prompt).trim()
  if (payload.city != null) data.city = String(payload.city).trim()
  if (payload.service != null) data.service = String(payload.service).trim()
  if (payload.fault != null) data.fault = String(payload.fault).trim()
  if (payload.topicSlug != null) data.topicSlug = String(payload.topicSlug).trim()
  if (payload.pageType != null) data.pageType = String(payload.pageType).trim()
  if (payload.promptType != null) data.promptType = String(payload.promptType).trim()
  if (payload.active != null) data.active = Boolean(payload.active)

  const updated = await prisma.geoPromptProbe.update({
    where: { id: row.id },
    data,
  })
  return mapPromptRow(updated)
}

module.exports = {
  listAdminGeoPrompts,
  getAdminGeoPrompt,
  createAdminGeoPrompt,
  updateAdminGeoPrompt,
  mapPromptRow,
}
