/**
 * 用户咨询线索 — R2
 * MOCK: 联调后接 /api/user/leads
 */
const { ENV } = require('./config')
const { get, post } = require('./request')
const { filterLeadsByTab } = require('../utils/lead-display')
const {
  mockFetchLeadConfirm,
  mockCreateLead,
  mockFetchUserLeads,
  mockGetLeadById,
  mockCancelLead,
} = require('../mock/leads')

async function fetchLeadConfirm(params) {
  if (ENV.mode === 'mock') {
    return mockFetchLeadConfirm(params)
  }
  return get('/user/leads/confirm', params)
}

async function createLead(payload) {
  if (ENV.mode === 'mock') {
    return mockCreateLead(payload)
  }
  return post('/user/leads', payload)
}

async function fetchUserLeads(params = {}) {
  if (ENV.mode === 'mock') {
    await new Promise((r) => setTimeout(r, 200))
    const list = await mockFetchUserLeads()
    const { tab } = params
    return tab ? filterLeadsByTab(list, tab) : list
  }
  const data = await get('/user/leads', params)
  const list = data.list || data
  return params.tab ? filterLeadsByTab(list, params.tab) : list
}

async function getLeadById(leadId) {
  if (ENV.mode === 'mock') {
    return mockGetLeadById(leadId)
  }
  return get(`/user/leads/${leadId}`)
}

async function cancelLead(leadId) {
  if (ENV.mode === 'mock') {
    return mockCancelLead(leadId)
  }
  return post(`/user/leads/${leadId}/cancel`)
}

module.exports = {
  fetchLeadConfirm,
  createLead,
  fetchUserLeads,
  getLeadById,
  cancelLead,
}
