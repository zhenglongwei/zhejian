const { get, post } = require('./request')

async function fetchMerchantSubscriptionPanel() {
  return get('/merchant/subscription')
}

async function createSubscriptionOrder(plan) {
  return post('/merchant/subscription/orders', { plan })
}

async function prepaySubscriptionOrder(orderId) {
  return post(`/merchant/subscription/orders/${orderId}/prepay`)
}

async function mockPaySubscriptionOrder(orderId) {
  return post(`/merchant/subscription/orders/${orderId}/mock-pay`)
}

module.exports = {
  fetchMerchantSubscriptionPanel,
  createSubscriptionOrder,
  prepaySubscriptionOrder,
  mockPaySubscriptionOrder,
}
