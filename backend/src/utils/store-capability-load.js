/**
 * 安全读取 stores.capability_json。
 * 兼容：迁移未执行 / Prisma Client 未 generate 时不抛错，返回 {}。
 */

const { prisma } = require('../lib/prisma')

function asCapabilityObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch (_) {
      /* ignore */
    }
  }
  return {}
}

async function loadStoreCapabilityById(storeId) {
  const id = String(storeId || '').trim()
  if (!id) return {}
  try {
    const store = await prisma.store.findUnique({
      where: { id },
      select: { capabilityJson: true },
    })
    return asCapabilityObject(store?.capabilityJson)
  } catch (_) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        'SELECT capability_json AS cj FROM stores WHERE id = ? LIMIT 1',
        id
      )
      const row = Array.isArray(rows) ? rows[0] : null
      return asCapabilityObject(row?.cj)
    } catch (_) {
      return {}
    }
  }
}

async function loadStoreCapabilitiesByIds(storeIds) {
  const ids = [...new Set((storeIds || []).map((id) => String(id || '').trim()).filter(Boolean))]
  if (!ids.length) return []
  try {
    const stores = await prisma.store.findMany({
      where: { id: { in: ids } },
      select: { id: true, capabilityJson: true },
    })
    return stores.map((store) => ({
      id: store.id,
      capabilityJson: asCapabilityObject(store.capabilityJson),
    }))
  } catch (_) {
    try {
      const placeholders = ids.map(() => '?').join(',')
      const rows = await prisma.$queryRawUnsafe(
        `SELECT id, capability_json AS cj FROM stores WHERE id IN (${placeholders})`,
        ...ids
      )
      return (rows || []).map((row) => ({
        id: row.id,
        capabilityJson: asCapabilityObject(row.cj),
      }))
    } catch (_) {
      return ids.map((id) => ({ id, capabilityJson: {} }))
    }
  }
}

module.exports = {
  asCapabilityObject,
  loadStoreCapabilityById,
  loadStoreCapabilitiesByIds,
}
