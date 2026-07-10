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
  resolveChargeAmountCents,
  resolvePlanPriceCents,
  formatSubscriptionRow,
  buildPlanSwitchQuote,
  schedulePlanDowngrade,
  hasPublicIndexEntitlement,
  isSubscriptionActive,
  canRenewSamePlan,
} = require('./merchant-subscription.service')
const {
  createJsapiOrder,
  buildMiniProgramPayParams,
  decryptNotifyResource,
  createRefund,
} = require('../lib/wechat-pay')

const ORDER_TTL_MINUTES = 30

function assertSwitchablePlan(plan) {
  if (plan !== MERCHANT_PLAN.FREE && !PUBLIC_INDEX_PLANS.has(plan)) {
    const err = new Error('无效的套餐类型')
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

async function processPriorPlanRefund(merchantId, priorPlan, refundExcessCents) {
  if (!refundExcessCents || refundExcessCents <= 0 || !priorPlan) return null

  const lastOrder = await prisma.merchantPaymentOrder.findFirst({
    where: {
      merchantId,
      plan: priorPlan,
      status: MERCHANT_PAYMENT_STATUS.PAID,
    },
    orderBy: { paidAt: 'desc' },
  })

  if (!lastOrder?.wxTransactionId) {
    if (config.devAuthEnabled) {
      console.warn(
        '[merchant-payment] dev skip refund',
        priorPlan,
        refundExcessCents
      )
      return { skipped: true, refundExcessCents }
    }
    const err = new Error('未找到可退款的支付单，请联系客服处理差额')
    err.status = 409
    throw err
  }

  if (refundExcessCents > lastOrder.amount) {
    const err = new Error('退款金额超过原支付金额')
    err.status = 400
    throw err
  }

  if (!config.wechatPay.configured) {
    if (config.devAuthEnabled) {
      return { skipped: true, refundExcessCents, mock: true }
    }
    const err = new Error('微信支付未配置，无法退款')
    err.status = 503
    throw err
  }

  return createRefund({
    transactionId: lastOrder.wxTransactionId,
    outRefundNo: newId('mref'),
    refundAmount: refundExcessCents,
    totalAmount: lastOrder.amount,
    reason: '套餐调整退差额',
  })
}

function readOrderProration(order) {
  const meta = order?.notifyPayloadJson
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { priorPlan: '', creditAppliedCents: 0, refundExcessCents: 0 }
  }
  if (meta.proration && typeof meta.proration === 'object') {
    return {
      priorPlan: meta.proration.priorPlan || '',
      creditAppliedCents: Number(meta.proration.creditAppliedCents) || 0,
      refundExcessCents: Number(meta.proration.refundExcessCents) || 0,
    }
  }
  return { priorPlan: '', creditAppliedCents: 0, refundExcessCents: 0 }
}

async function createSubscriptionOrder(auth, plan) {
  assertSwitchablePlan(plan)
  const subscription = await getOrCreateSubscription(auth.merchantId)
  const listPrice =
    plan === MERCHANT_PLAN.FREE ? 0 : resolvePlanPriceCents(plan, subscription)
  const chargePrice =
    plan === MERCHANT_PLAN.FREE ? 0 : resolveChargeAmountCents(plan, subscription)

  if (plan === MERCHANT_PLAN.FREE) {
    if (subscription.plan === MERCHANT_PLAN.FREE && !subscription.pendingPlan) {
      const err = new Error('当前已是基础版')
      err.status = 409
      throw err
    }
  } else if (
    subscription.plan === plan &&
    !subscription.pendingPlan &&
    !canRenewSamePlan(subscription, plan) &&
    isSubscriptionActive(subscription) &&
    hasPublicIndexEntitlement(subscription)
  ) {
    const err = new Error('当前已是该套餐，无需重复购买')
    err.status = 409
    throw err
  }

  if (
    subscription.plan === plan &&
    subscription.pendingPlan &&
    isSubscriptionActive(subscription)
  ) {
    await prisma.merchantSubscription.update({
      where: { merchantId: auth.merchantId },
      data: { pendingPlan: null },
    })
    const activated = await getOrCreateSubscription(auth.merchantId)
    return {
      immediate: true,
      keptCurrent: true,
      plan,
      planLabel: MERCHANT_PLAN_LABELS[plan],
      subscription: formatSubscriptionRow(activated),
      proration: {
        summary: '已取消预约变更，继续当前套餐',
      },
    }
  }

  const quote = await buildPlanSwitchQuote(
    subscription,
    plan,
    listPrice,
    chargePrice
  )

  if (quote.switchMode === 'downgrade_scheduled') {
    if (quote.isPendingPlan) {
      const err = new Error('已预约该方案，到期后自动切换')
      err.status = 409
      throw err
    }
    if (subscription.pendingPlan && subscription.pendingPlan !== plan) {
      const err = new Error('请先取消当前预约，再选择其他套餐')
      err.status = 409
      throw err
    }
    await schedulePlanDowngrade(auth.merchantId, plan)
    const activated = await getOrCreateSubscription(auth.merchantId)
    return {
      scheduled: true,
      plan,
      planLabel: MERCHANT_PLAN_LABELS[plan],
      effectiveAt: quote.effectiveAt,
      subscription: formatSubscriptionRow(activated),
      proration: {
        summary: quote.summary,
      },
    }
  }

  const amount = quote.amountCents
  const priorPlan =
    PUBLIC_INDEX_PLANS.has(subscription.plan) &&
    isSubscriptionActive(subscription) &&
    subscription.plan !== plan
      ? subscription.plan
      : ''

  const proration = {
    priorPlan,
    creditAppliedCents: 0,
    refundExcessCents: quote.refundExcessCents,
  }

  const orderExpiresAt = new Date(Date.now() + ORDER_TTL_MINUTES * 60 * 1000)

  if (amount <= 0) {
    const order = await prisma.merchantPaymentOrder.create({
      data: {
        id: newId('mpay'),
        merchantId: auth.merchantId,
        userId: auth.userId,
        plan,
        amount: 0,
        status: MERCHANT_PAYMENT_STATUS.PAID,
        paidAt: new Date(),
        orderExpiresAt,
        notifyPayloadJson: {
          proration,
          zeroAmountSwitch: true,
          standardTrial: quote.switchMode === 'trial',
        },
      },
    })

    await processPriorPlanRefund(
      auth.merchantId,
      proration.priorPlan,
      proration.refundExcessCents
    )
    const activated = await activateMerchantPlan(auth.merchantId, plan, {
      isStandardTrial: quote.switchMode === 'trial',
    })

    return {
      orderId: order.id,
      plan,
      planLabel: MERCHANT_PLAN_LABELS[plan],
      amount: 0,
      amountYuan: '0.00',
      orderExpiresAt: orderExpiresAt.toISOString(),
      wechatPayConfigured: config.wechatPay.configured,
      immediate: true,
      trial: quote.switchMode === 'trial',
      subscription: activated,
      proration: {
        ...proration,
        creditYuan: quote.creditYuan,
        refundExcessYuan: quote.refundExcessYuan,
        summary: quote.summary,
      },
    }
  }

  const order = await prisma.merchantPaymentOrder.create({
    data: {
      id: newId('mpay'),
      merchantId: auth.merchantId,
      userId: auth.userId,
      plan,
      amount,
      status: MERCHANT_PAYMENT_STATUS.CREATED,
      orderExpiresAt,
      notifyPayloadJson: { proration },
    },
  })

  return {
    orderId: order.id,
    plan,
    planLabel: MERCHANT_PLAN_LABELS[plan],
    amount,
    amountYuan: (amount / 100).toFixed(2),
    listPriceYuan: (listPrice / 100).toFixed(2),
    orderExpiresAt: orderExpiresAt.toISOString(),
    wechatPayConfigured: config.wechatPay.configured,
    proration: {
      ...proration,
      creditYuan: quote.creditYuan,
      refundExcessYuan: quote.refundExcessYuan,
      summary: quote.summary,
    },
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

  if (order.amount <= 0) {
    return {
      orderId: order.id,
      immediate: true,
      message: '无需支付，套餐已切换',
    }
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
  const proration = readOrderProration(order)

  if (order.status === MERCHANT_PAYMENT_STATUS.PAID) {
    return {
      alreadyPaid: true,
      subscription: await activateMerchantPlan(order.merchantId, order.plan, {
        isStandardTrial: Boolean(
          order.notifyPayloadJson &&
            typeof order.notifyPayloadJson === 'object' &&
            order.notifyPayloadJson.standardTrial
        ),
      }),
    }
  }

  await prisma.merchantPaymentOrder.update({
    where: { id: order.id },
    data: {
      status: MERCHANT_PAYMENT_STATUS.PAID,
      paidAt: new Date(),
      wxTransactionId: wxPayload.transaction_id || wxPayload.transactionId || '',
      notifyPayloadJson: {
        ...(order.notifyPayloadJson && typeof order.notifyPayloadJson === 'object'
          ? order.notifyPayloadJson
          : {}),
        wxPayload,
      },
    },
  })

  if (proration.refundExcessCents > 0) {
    await processPriorPlanRefund(
      order.merchantId,
      proration.priorPlan,
      proration.refundExcessCents
    )
  }

  const subscription = await activateMerchantPlan(order.merchantId, order.plan, {
    isStandardTrial: Boolean(
      order.notifyPayloadJson &&
        typeof order.notifyPayloadJson === 'object' &&
        order.notifyPayloadJson.standardTrial
    ),
  })
  return { alreadyPaid: false, subscription, proration }
}

async function handleWechatPayNotify(body) {
  const resource = body && body.resource
  const decrypted = decryptNotifyResource(resource)
  if (decrypted.trade_state !== 'SUCCESS') {
    return { handled: false, reason: decrypted.trade_state }
  }

  if (decrypted.appid && decrypted.appid !== config.wechat.appId) {
    const err = new Error('回调 appid 不匹配')
    err.status = 400
    throw err
  }
  if (decrypted.mchid && decrypted.mchid !== config.wechatPay.mchId) {
    const err = new Error('回调 mchid 不匹配')
    err.status = 400
    throw err
  }

  const order = await prisma.merchantPaymentOrder.findUnique({
    where: { id: decrypted.out_trade_no },
  })
  if (!order) {
    return { handled: false, reason: 'order_not_found' }
  }

  const paidTotal = Number(decrypted.amount && decrypted.amount.total)
  if (!Number.isFinite(paidTotal) || paidTotal !== Number(order.amount)) {
    const err = new Error('回调金额与订单不一致')
    err.status = 400
    throw err
  }

  await completePaidOrder(order, decrypted)
  return { handled: true }
}

async function mockPaySubscriptionOrder(auth, orderId) {
  if (config.nodeEnv === 'production' || !config.devAuthEnabled) {
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
