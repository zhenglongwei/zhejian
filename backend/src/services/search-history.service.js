const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')

const SEARCH_HISTORY_MAX = 10
const SEARCH_KEYWORD_MAX = 30

const PHONE_RE = /^1\d{10}$/
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i
const PLATE_RE =
  /^[\u4e00-\u9fa5][A-Z][·•]?[A-HJ-NP-Z0-9]{4,6}[\u4e00-\u9fa5]?$|^[A-Z]{2}[A-HJ-NP-Z0-9]{4,6}$/i

function normalizeKeyword(keyword) {
  return String(keyword || '').trim()
}

function isSensitiveSearchKeyword(keyword) {
  const value = normalizeKeyword(keyword)
  if (!value) return true
  const compact = value.replace(/\s/g, '')
  if (PHONE_RE.test(compact)) return true
  if (VIN_RE.test(compact)) return true
  if (PLATE_RE.test(compact)) return true
  return false
}

function validateSearchKeyword(keyword) {
  const value = normalizeKeyword(keyword)
  if (!value) {
    const err = new Error('请输入搜索关键词')
    err.status = 400
    throw err
  }
  if (value.length > SEARCH_KEYWORD_MAX) {
    const err = new Error(`关键词不超过 ${SEARCH_KEYWORD_MAX} 字`)
    err.status = 400
    throw err
  }
  if (isSensitiveSearchKeyword(value)) {
    const err = new Error('不支持保存该搜索内容')
    err.status = 400
    throw err
  }
  return value
}

function mapHistoryRows(rows) {
  return (rows || []).map((row) => ({
    keyword: row.keyword,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ''),
  }))
}

async function trimUserSearchHistory(userId) {
  const rows = await prisma.userSearchHistory.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
    skip: SEARCH_HISTORY_MAX,
  })
  if (!rows.length) return
  await prisma.userSearchHistory.deleteMany({
    where: { id: { in: rows.map((row) => row.id) } },
  })
}

async function listUserSearchHistory(userId) {
  const rows = await prisma.userSearchHistory.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: SEARCH_HISTORY_MAX,
  })
  const list = mapHistoryRows(rows)
  return {
    list,
    keywords: list.map((item) => item.keyword),
  }
}

async function addUserSearchHistory(userId, keyword) {
  const value = validateSearchKeyword(keyword)
  const now = new Date()

  await prisma.userSearchHistory.upsert({
    where: {
      userId_keyword: {
        userId,
        keyword: value,
      },
    },
    create: {
      id: newId('srch'),
      userId,
      keyword: value,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      updatedAt: now,
    },
  })

  await trimUserSearchHistory(userId)
  return listUserSearchHistory(userId)
}

async function clearUserSearchHistory(userId) {
  await prisma.userSearchHistory.deleteMany({ where: { userId } })
  return { list: [], keywords: [] }
}

module.exports = {
  SEARCH_HISTORY_MAX,
  SEARCH_KEYWORD_MAX,
  listUserSearchHistory,
  addUserSearchHistory,
  clearUserSearchHistory,
  isSensitiveSearchKeyword,
}
