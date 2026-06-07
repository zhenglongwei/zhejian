const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { maskPlate } = require('../utils/plate-mask')

const MAX_VEHICLES = 5

async function assertPhoneBound(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
  if (!user || !user.phone) {
    const err = new Error('请先绑定手机号')
    err.status = 403
    throw err
  }
}

function formatVehicleRow(row) {
  const brand = row.brand || ''
  const series = row.series || ''
  const modelYear = row.modelYear || ''
  const titleParts = [brand, series].filter(Boolean)
  let displayTitle = titleParts.join(' ')
  if (modelYear) {
    displayTitle = displayTitle ? `${displayTitle} · ${modelYear}款` : `${modelYear}款`
  }
  return {
    id: row.id,
    brand,
    series,
    modelYear,
    plateDisplay: row.plateDisplay || '',
    isDefault: Boolean(row.isDefault),
    displayTitle: displayTitle || '未命名车辆',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function validateVehiclePayload(payload = {}, { partial = false } = {}) {
  const brand = String(payload.brand || '').trim()
  const series = String(payload.series || '').trim()
  const modelYear = String(payload.modelYear || payload.model_year || '').trim()
  const plateRaw = String(payload.plate || payload.plateDisplay || '').trim()

  if (!partial || payload.brand !== undefined) {
    if (!brand) {
      const err = new Error('请填写车辆品牌')
      err.status = 400
      throw err
    }
  }
  if (!partial || payload.series !== undefined) {
    if (!series) {
      const err = new Error('请填写车型')
      err.status = 400
      throw err
    }
  }

  return {
    brand,
    series,
    modelYear,
    plateDisplay: plateRaw ? maskPlate(plateRaw) : '',
  }
}

async function countActiveVehicles(userId) {
  return prisma.userVehicle.count({
    where: { userId, deletedAt: null },
  })
}

async function listUserVehicles(userId) {
  await assertPhoneBound(userId)
  const rows = await prisma.userVehicle.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  })
  return { list: rows.map(formatVehicleRow) }
}

async function getDefaultUserVehicle(userId) {
  if (!userId) return null
  const row = await prisma.userVehicle.findFirst({
    where: { userId, deletedAt: null, isDefault: true },
    orderBy: { updatedAt: 'desc' },
  })
  if (row) return formatVehicleRow(row)
  const fallback = await prisma.userVehicle.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
  })
  return fallback ? formatVehicleRow(fallback) : null
}

async function getUserVehicle(userId, vehicleId) {
  await assertPhoneBound(userId)
  const row = await prisma.userVehicle.findFirst({
    where: { id: vehicleId, userId, deletedAt: null },
  })
  if (!row) {
    const err = new Error('车辆不存在')
    err.status = 404
    throw err
  }
  return formatVehicleRow(row)
}

async function createUserVehicle(userId, payload = {}) {
  await assertPhoneBound(userId)
  const activeCount = await countActiveVehicles(userId)
  if (activeCount >= MAX_VEHICLES) {
    const err = new Error(`最多添加 ${MAX_VEHICLES} 辆车`)
    err.status = 400
    throw err
  }

  const data = validateVehiclePayload(payload)
  const shouldDefault = Boolean(payload.isDefault) || activeCount === 0

  if (shouldDefault) {
    await prisma.userVehicle.updateMany({
      where: { userId, deletedAt: null, isDefault: true },
      data: { isDefault: false },
    })
  }

  const row = await prisma.userVehicle.create({
    data: {
      id: newId('veh'),
      userId,
      ...data,
      isDefault: shouldDefault,
    },
  })
  return formatVehicleRow(row)
}

async function updateUserVehicle(userId, vehicleId, payload = {}) {
  await assertPhoneBound(userId)
  const existing = await prisma.userVehicle.findFirst({
    where: { id: vehicleId, userId, deletedAt: null },
  })
  if (!existing) {
    const err = new Error('车辆不存在')
    err.status = 404
    throw err
  }

  const data = validateVehiclePayload(
    {
      brand: payload.brand !== undefined ? payload.brand : existing.brand,
      series: payload.series !== undefined ? payload.series : existing.series,
      modelYear:
        payload.modelYear !== undefined
          ? payload.modelYear
          : payload.model_year !== undefined
            ? payload.model_year
            : existing.modelYear,
      plate:
        payload.plate !== undefined
          ? payload.plate
          : payload.plateDisplay !== undefined
            ? payload.plateDisplay
            : existing.plateDisplay,
    },
    { partial: false }
  )

  const row = await prisma.userVehicle.update({
    where: { id: vehicleId },
    data,
  })
  return formatVehicleRow(row)
}

async function deleteUserVehicle(userId, vehicleId) {
  await assertPhoneBound(userId)
  const existing = await prisma.userVehicle.findFirst({
    where: { id: vehicleId, userId, deletedAt: null },
  })
  if (!existing) {
    const err = new Error('车辆不存在')
    err.status = 404
    throw err
  }

  await prisma.userVehicle.update({
    where: { id: vehicleId },
    data: { deletedAt: new Date(), isDefault: false },
  })

  if (existing.isDefault) {
    const next = await prisma.userVehicle.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    })
    if (next) {
      await prisma.userVehicle.update({
        where: { id: next.id },
        data: { isDefault: true },
      })
    }
  }

  return { ok: true }
}

async function setDefaultUserVehicle(userId, vehicleId) {
  await assertPhoneBound(userId)
  const existing = await prisma.userVehicle.findFirst({
    where: { id: vehicleId, userId, deletedAt: null },
  })
  if (!existing) {
    const err = new Error('车辆不存在')
    err.status = 404
    throw err
  }

  await prisma.$transaction([
    prisma.userVehicle.updateMany({
      where: { userId, deletedAt: null, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.userVehicle.update({
      where: { id: vehicleId },
      data: { isDefault: true },
    }),
  ])

  return getUserVehicle(userId, vehicleId)
}

module.exports = {
  MAX_VEHICLES,
  listUserVehicles,
  getDefaultUserVehicle,
  getUserVehicle,
  createUserVehicle,
  updateUserVehicle,
  deleteUserVehicle,
  setDefaultUserVehicle,
}
