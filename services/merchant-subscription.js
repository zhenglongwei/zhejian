const { get, post } = require('./request')

async function fetchMerchantSubscriptionPanel() {
  return get('/merchant/subscription')
}

async function createSubscriptionOrder(plan, options = {}) {
  const body = { plan, intent: options.intent }
  if (options.subscriptionConsent) {
    body.subscriptionConsent = options.subscriptionConsent
  }
  return post('/merchant/subscription/orders', body)
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
