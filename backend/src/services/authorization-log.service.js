const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')

/**
 * @param {string} userId
 * @param {Array<{ authType: string, businessId?: string, authTextVersion: string, authTextSnapshot: string, remark?: string }>} entries
 * @param {{ clientType?: string, ip?: string, deviceInfo?: string }} meta
 */
async function recordAuthorizationLogs(userId, entries = [], meta = {}) {
  if (!userId || !Array.isArray(entries) || !entries.length) return []

  const rows = entries
    .filter(
      (item) =>
        item &&
        item.authType &&
        item.authTextVersion &&
        item.authTextSnapshot
    )
    .map((item) => ({
      id: newId('authlog'),
      userId,
      authType: String(item.authType),
      businessId: String(item.businessId || ''),
      authStatus: 'authorized',
      authTextVersion: String(item.authTextVersion),
      authTextSnapshot: String(item.authTextSnapshot),
      clientType: String(meta.clientType || 'miniprogram'),
      ip: String(meta.ip || '').slice(0, 64),
      deviceInfo: String(meta.deviceInfo || '').slice(0, 2000),
      remark: String(item.remark || '').slice(0, 255),
    }))

  if (!rows.length) return []

  await prisma.authorizationLog.createMany({ data: rows })
  return rows
}

async function recordAuthorizationLog(userId, entry, meta = {}) {
  const rows = await recordAuthorizationLogs(userId, [entry], meta)
  return rows[0] || null
}

module.exports = {
  recordAuthorizationLog,
  recordAuthorizationLogs,
}
