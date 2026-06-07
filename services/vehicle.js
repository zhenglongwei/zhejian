const { get, post, put, del } = require('./request')
const { ENV } = require('./config')
const {
  listMockVehicles,
  getMockDefaultVehicle,
  getMockVehicle,
  createMockVehicle,
  updateMockVehicle,
  deleteMockVehicle,
  setMockDefaultVehicle,
} = require('../mock/vehicle')

async function fetchUserVehicles() {
  if (ENV.mode === 'mock') {
    return listMockVehicles()
  }
  const data = await get('/user/vehicles')
  return data?.list || []
}

async function fetchDefaultVehicle() {
  if (ENV.mode === 'mock') {
    return getMockDefaultVehicle()
  }
  return get('/user/vehicles/default')
}

async function fetchUserVehicle(vehicleId) {
  if (ENV.mode === 'mock') {
    return getMockVehicle(vehicleId)
  }
  return get(`/user/vehicles/${vehicleId}`)
}

async function createUserVehicle(payload) {
  if (ENV.mode === 'mock') {
    return createMockVehicle(payload)
  }
  return post('/user/vehicles', payload, { showLoading: true, loadingText: '保存中' })
}

async function updateUserVehicle(vehicleId, payload) {
  if (ENV.mode === 'mock') {
    return updateMockVehicle(vehicleId, payload)
  }
  return put(`/user/vehicles/${vehicleId}`, payload, { showLoading: true, loadingText: '保存中' })
}

async function deleteUserVehicle(vehicleId) {
  if (ENV.mode === 'mock') {
    return deleteMockVehicle(vehicleId)
  }
  return del(`/user/vehicles/${vehicleId}`, {}, { showLoading: true, loadingText: '删除中' })
}

async function setDefaultVehicle(vehicleId) {
  if (ENV.mode === 'mock') {
    return setMockDefaultVehicle(vehicleId)
  }
  return post(`/user/vehicles/${vehicleId}/set-default`, {}, { showLoading: true, loadingText: '处理中' })
}

module.exports = {
  fetchUserVehicles,
  fetchDefaultVehicle,
  fetchUserVehicle,
  createUserVehicle,
  updateUserVehicle,
  deleteUserVehicle,
  setDefaultVehicle,
}
