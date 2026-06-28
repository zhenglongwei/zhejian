const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { config } = require('../config')
const {
  MERCHANT_PLAN,
  MERCHANT_PLAN_LABELS,
  MERCHANT_PAYMENT_STATUS,
  PUBLIC_INDEX_PLANS,
} = require('../constants/merchant-subscription')
const {
  getOrCreateSubscription,
  activateMerchantPlan,
  resolvePlanPriceCents,
  resolveChargeAmountCents,
} = require('./merchant-subscription.service')
const {
  createJsapiOrder,
  buildMiniProgramPayParams,
  decryptNotifyResource,
} = require('../lib/wechat-pay')

const ORDER_TTL_MINUTES = 30

function assertPaidPlan(plan) {
  if (!PUBLIC_INDEX_PLANS.has(plan)) {
    const err = new Error('该套餐暂不支持在线购买')
    err.status = 400
    throw err
  }
}

async function resolvePayerOpenid(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.openid) {
    const err = new Error('请使用微信登录后再购买')
    err.status = 403
    throw err
  }
  return user.openid
}

async function createSubscriptionOrder(auth, plan) {
  assertPaidPlan(plan)
  const subscription = await getOrCreateSubscription(auth.merchantId)
  const amount = resolveChargeAmountCents(plan, subscription)
  if (amount <= 0) {
    const err = new Error('订单金额无效')
    err.status = 400
    throw err
  }

  const orderExpiresAt = new Date(Date.now() + ORDER_TTL_MINUTES * 60 * 1000)
  const order = await prisma.merchantPaymentOrder.create({
    data: {
      id: newId('mpay'),
      merchantId: auth.merchantId,
      userId: auth.userId,
      plan,
      amount,
      status: MERCHANT_PAYMENT_STATUS.CREATED,
      orderExpiresAt,
    },
  })

  return {
    orderId: order.id,
    plan,
    planLabel: MERCHANT_PLAN_LABELS[plan],
    amount,
    amountYuan: (amount / 100).toFixed(2),
    orderExpiresAt: orderExpiresAt.toISOString(),
    wechatPayConfigured: config.wechatPay.configured,
  }
}

async function prepaySubscriptionOrder(auth, orderId) {
  const order = await prisma.merchantPaymentOrder.findUnique({ where: { id: orderId } })
  if (!order || order.merchantId !== auth.merchantId) {
    const err = new Error('订单不存在')
    err.status = 404
    throw err
  }
  if (order.status === MERCHANT_PAYMENT_STATUS.PAID) {
    const err = new Error('订单已支付')
    err.status = 409
    throw err
  }
  if (order.orderExpiresAt && order.orderExpiresAt.getTime() < Date.now()) {
    await prisma.merchantPaymentOrder.update({
      where: { id: order.id },
      data: { status: MERCHANT_PAYMENT_STATUS.CLOSED },
    })
    const err = new Error('订单已过期，请重新下单')
    err.status = 409
    throw err
  }

  if (!config.wechatPay.configured) {
    if (config.devAuthEnabled) {
      return {
        orderId: order.id,
        mock: true,
        message: '开发环境未配置微信支付，可调用 mock-pay 完成联调',
      }
    }
    const err = new Error('微信支付未配置')
    err.status = 503
    throw err
  }

  const openid = await resolvePayerOpenid(auth.userId)
  const prepayId =
    order.wxPrepayId ||
    (await createJsapiOrder({
      outTradeNo: order.id,
      description: `辙见${MERCHANT_PLAN_LABELS[order.plan]}`,
      amount: order.amount,
      openid,
    }))

  if (!order.wxPrepayId) {
    await prisma.merchantPaymentOrder.update({
      where: { id: order.id },
      data: {
        wxPrepayId: prepayId,
        status: MERCHANT_PAYMENT_STATUS.PAYING,
      },
    })
  }

  return {
    orderId: order.id,
    payment: buildMiniProgramPayParams(prepayId),
  }
}

async function completePaidOrder(order, wxPayload = {}) {
  if (order.status === MERCHANT_PAYMENT_STATUS.PAID) {
    return { alreadyPaid: true, subscription: await activateMerchantPlan(order.merchantId, order.plan) }
  }

  await prisma.merchantPaymentOrder.update({
    where: { id: order.id },
    data: {
      status: MERCHANT_PAYMENT_STATUS.PAID,
      paidAt: new Date(),
      wxTransactionId: wxPayload.transaction_id || wxPayload.transactionId || '',
      notifyPayloadJson: wxPayload,
    },
  })

  const subscription = await activateMerchantPlan(order.merchantId, order.plan)
  return { alreadyPaid: false, subscription }
}

async function handleWechatPayNotify(body) {
  const resource = body && body.resource
  const decrypted = decryptNotifyResource(resource)
  if (decrypted.trade_state !== 'SUCCESS') {
    return { handled: false, reason: decrypted.trade_state }
  }

  const order = await prisma.merchantPaymentOrder.findUnique({
    where: { id: decrypted.out_trade_no },
  })
  if (!order) {
    return { handled: false, reason: 'order_not_found' }
  }

  await completePaidOrder(order, decrypted)
  return { handled: true }
}

async function mockPaySubscriptionOrder(auth, orderId) {
  if (!config.devAuthEnabled) {
    const err = new Error('不允许 mock 支付')
    err.status = 403
    throw err
  }
  const order = await prisma.merchantPaymentOrder.findUnique({ where: { id: orderId } })
  if (!order || order.merchantId !== auth.merchantId) {
    const err = new Error('订单不存在')
    err.status = 404
    throw err
  }
  return completePaidOrder(order, { mock: true, transaction_id: `mock_${Date.now()}` })
}

module.exports = {
  createSubscriptionOrder,
  prepaySubscriptionOrder,
  handleWechatPayNotify,
  mockPaySubscriptionOrder,
}
