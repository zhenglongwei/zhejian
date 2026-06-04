/**
 * 商家服务方案 — 上架态预约开关（M-SVC-07）
 * 独立模块，避免分包引用 service.js 时缓存旧导出
 */
const { ENV } = require('./config')
const { post } = require('./request')
const { SERVICE_STATUS } = require('../constants/service')

const STORAGE_KEY = 'merchant_services_v1'

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadMerchantServices() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || []
  } catch (e) {
    return []
  }
}

function saveMerchantServices(list) {
  wx.setStorageSync(STORAGE_KEY, list)
}

async function pauseServiceAppointment(planId) {
  if (ENV.mode !== 'mock') {
    return post(`/merchant/service-plans/${planId}/pause-appointment`, {})
  }
  await delay()
  const list = loadMerchantServices()
  const idx = list.findIndex((s) => s.id === planId)
  if (idx < 0) throw new Error('服务方案不存在')
  const row = list[idx]
  if (row.status !== SERVICE_STATUS.PUBLISHED) {
    throw new Error('仅已上架的服务可暂停预约')
  }
  list[idx] = {
    ...row,
    acceptAppointment: false,
    updatedAt: Date.now(),
  }
  saveMerchantServices(list)
  return list[idx]
}

async function resumeServiceAppointment(planId) {
  if (ENV.mode !== 'mock') {
    return post(`/merchant/service-plans/${planId}/resume-appointment`, {})
  }
  await delay()
  const list = loadMerchantServices()
  const idx = list.findIndex((s) => s.id === planId)
  if (idx < 0) throw new Error('服务方案不存在')
  const row = list[idx]
  if (row.status !== SERVICE_STATUS.PUBLISHED) {
    throw new Error('仅已上架的服务可恢复预约')
  }
  list[idx] = {
    ...row,
    acceptAppointment: true,
    updatedAt: Date.now(),
  }
  saveMerchantServices(list)
  return list[idx]
}

module.exports = {
  pauseServiceAppointment,
  resumeServiceAppointment,
}
