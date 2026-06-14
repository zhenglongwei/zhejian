const { getSession } = require('../utils/auth')
const { maskPlate } = require('../utils/order-form')
const { MAX_USER_VEHICLES } = require('../constants/user-vehicle')
const { countMockUserAlbumsForVehicle } = require('./service-albums')

const STORAGE_KEY = 'mock_user_vehicles'

function readStore() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || []
  } catch (e) {
    return []
  }
}

function writeStore(list) {
  wx.setStorageSync(STORAGE_KEY, list)
}

function currentUserId() {
  const { user } = getSession()
  return (user && user.userId) || 'mock_user'
}

function formatRow(row) {
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
    albumCount: countMockUserAlbumsForVehicle(row),
  }
}

function activeRows(userId) {
  return readStore().filter((row) => row.userId === userId && !row.deletedAt)
}

function listMockVehicles() {
  return Promise.resolve(activeRows(currentUserId()).map(formatRow))
}

function getMockDefaultVehicle() {
  const rows = activeRows(currentUserId())
  const row = rows.find((item) => item.isDefault) || rows[0] || null
  return Promise.resolve(row ? formatRow(row) : null)
}

function getMockVehicle(vehicleId) {
  const row = activeRows(currentUserId()).find((item) => item.id === vehicleId)
  if (!row) {
    return Promise.reject({ message: '车辆不存在' })
  }
  return Promise.resolve(formatRow(row))
}

function createMockVehicle(payload = {}) {
  const userId = currentUserId()
  const rows = activeRows(userId)
  if (rows.length >= MAX_USER_VEHICLES) {
    return Promise.reject({ message: `最多添加 ${MAX_USER_VEHICLES} 辆车` })
  }
  const brand = String(payload.brand || '').trim()
  const series = String(payload.series || '').trim()
  if (!brand || !series) {
    return Promise.reject({ message: '请填写品牌与车型' })
  }
  const shouldDefault = Boolean(payload.isDefault) || rows.length === 0
  const list = readStore().map((row) =>
    row.userId === userId && row.isDefault && shouldDefault ? { ...row, isDefault: false } : row
  )
  const row = {
    id: `veh_mock_${Date.now()}`,
    userId,
    brand,
    series,
    modelYear: String(payload.modelYear || '').trim(),
    plateDisplay: maskPlate(payload.plate || payload.plateDisplay || ''),
    isDefault: shouldDefault,
    deletedAt: null,
  }
  writeStore([row, ...list])
  return Promise.resolve(formatRow(row))
}

function updateMockVehicle(vehicleId, payload = {}) {
  const userId = currentUserId()
  const list = readStore()
  const index = list.findIndex((row) => row.userId === userId && row.id === vehicleId && !row.deletedAt)
  if (index < 0) {
    return Promise.reject({ message: '车辆不存在' })
  }
  const current = list[index]
  const next = {
    ...current,
    brand: payload.brand !== undefined ? String(payload.brand).trim() : current.brand,
    series: payload.series !== undefined ? String(payload.series).trim() : current.series,
    modelYear:
      payload.modelYear !== undefined ? String(payload.modelYear).trim() : current.modelYear,
    plateDisplay:
      payload.plate !== undefined || payload.plateDisplay !== undefined
        ? maskPlate(payload.plate || payload.plateDisplay || '')
        : current.plateDisplay,
  }
  if (!next.brand || !next.series) {
    return Promise.reject({ message: '请填写品牌与车型' })
  }
  list[index] = next
  writeStore(list)
  return Promise.resolve(formatRow(next))
}

function deleteMockVehicle(vehicleId) {
  const userId = currentUserId()
  const list = readStore()
  const index = list.findIndex((row) => row.userId === userId && row.id === vehicleId && !row.deletedAt)
  if (index < 0) {
    return Promise.reject({ message: '车辆不存在' })
  }
  list[index] = { ...list[index], deletedAt: Date.now(), isDefault: false }
  writeStore(list)
  return Promise.resolve({ ok: true })
}

function setMockDefaultVehicle(vehicleId) {
  const userId = currentUserId()
  const list = readStore().map((row) => {
    if (row.userId !== userId || row.deletedAt) return row
    return { ...row, isDefault: row.id === vehicleId }
  })
  writeStore(list)
  return getMockVehicle(vehicleId)
}

module.exports = {
  listMockVehicles,
  getMockDefaultVehicle,
  getMockVehicle,
  createMockVehicle,
  updateMockVehicle,
  deleteMockVehicle,
  setMockDefaultVehicle,
}
