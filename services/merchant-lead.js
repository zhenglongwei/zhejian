/**
 * V2.0 商家咨询线索 — MOCK: mock/leads.js
 * 联调后接 GET/POST /api/merchant/leads/*
 */
const { ENV } = require('./config')
const { get, post } = require('./request')
const {
  mockFetchMerchantLeads,
  mockGetMerchantLeadById,
  mockMarkLeadViewed,
  mockMarkLeadContacted,
  mockCloseLead,
  mockFetchMerchantLeadStats,
} = require('../mock/leads')

async function fetchMerchantLeads(params = {}) {
  if (ENV.mode === 'mock') {
    return mockFetchMerchantLeads(params)
  }
  const data = await get('/merchant/leads', params)
  return data.list || data
}

async function getMerchantLeadById(leadId, storeId) {
  if (ENV.mode === 'mock') {
    return mockGetMerchantLeadById(leadId, storeId)
  }
  return get(`/merchant/leads/${leadId}`, { storeId })
}

async function markLeadViewed(leadId, storeId) {
  if (ENV.mode === 'mock') {
    return mockMarkLeadViewed(leadId, storeId)
  }
  return post(`/merchant/leads/${leadId}/view`, { storeId })
}

async function markLeadContacted(leadId, storeId, note = '') {
  if (ENV.mode === 'mock') {
    return mockMarkLeadContacted(leadId, storeId, note)
  }
  return post(`/merchant/leads/${leadId}/contact`, { storeId, note })
}

async function closeLead(leadId, storeId, payload) {
  if (ENV.mode === 'mock') {
    return mockCloseLead(leadId, storeId, payload)
  }
  return post(`/merchant/leads/${leadId}/close`, { storeId, ...payload })
}

async function fetchMerchantLeadStats(storeId) {
  if (ENV.mode === 'mock') {
    return mockFetchMerchantLeadStats(storeId)
  }
  return get('/merchant/leads/stats', { storeId })
}

module.exports = {
  fetchMerchantLeads,
  getMerchantLeadById,
  markLeadViewed,
  markLeadContacted,
  closeLead,
  fetchMerchantLeadStats,
}
