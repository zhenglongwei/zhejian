/**
 * 订阅消息模板字段回归：报价/交车共用「订单状态变更提醒」，评价用「服务评价通知」
 * 运行：node src/constants/notification-templates.test.js
 */
process.env.WECHAT_TMPL_ORDER_STATUS = 'QMnR-hGBLTi1FL9602l5LU-y0mEfY667yxl9586UzS4'
process.env.WECHAT_TMPL_REVIEW = 'pR10lhhvVyEg5dRfoa6n9o_-HBp0HgSs1K3DYsG3GA4'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  SUBSCRIBE_TEMPLATE_KEYS,
  getSubscribeTemplateId,
  buildSubscribePayload,
  formatWechatTime,
} = require('./notification-templates')

test('车主首次打开相册一次授权报价/交车与评价两张模板', () => {
  assert.deepEqual(SUBSCRIBE_TEMPLATE_KEYS.byScene.flow_confirm, ['order_status', 'review'])
  assert.equal(
    getSubscribeTemplateId('order_status'),
    'QMnR-hGBLTi1FL9602l5LU-y0mEfY667yxl9586UzS4',
  )
  assert.equal(
    getSubscribeTemplateId('review'),
    'pR10lhhvVyEg5dRfoa6n9o_-HBp0HgSs1K3DYsG3GA4',
  )
})

test('订单状态变更提醒：phrase2 状态 + thing3 内容 + thing4 提醒 + time5 时间', () => {
  const data = buildSubscribePayload('order_status', {
    title: '报价单待确认',
    content: '驰援汽车服务中心已发出报价单',
    time: new Date('2026-11-18T07:30:00.000Z'),
    serviceName: '发动机渗油维修',
    orderStatus: '待确认',
    tips: '确认后门店开始施工',
  })
  assert.deepEqual(Object.keys(data), ['phrase2', 'thing3', 'thing4', 'time5'])
  assert.equal(data.phrase2.value, '待确认')
  assert.equal(data.thing3.value, '发动机渗油维修')
  assert.equal(data.thing4.value, '确认后门店开始施工')
  assert.match(data.time5.value, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
})

test('服务评价通知：thing3 订单内容 + thing15 评价反馈 + date1 服务时间', () => {
  const data = buildSubscribePayload('review', {
    title: '门店邀请你评价',
    content: '邀请你为这次服务写下评价',
    time: new Date('2026-11-18T07:30:00.000Z'),
    serviceName: '发动机渗油维修',
    tips: '门店邀请你写下真实感受',
    serviceDate: new Date('2026-10-11T01:00:00.000Z'),
  })
  assert.deepEqual(Object.keys(data), ['thing3', 'thing15', 'date1'])
  assert.equal(data.thing3.value, '发动机渗油维修')
  assert.equal(data.thing15.value, '门店邀请你写下真实感受')
  assert.match(data.date1.value, /^\d{4}年\d{1,2}月\d{1,2}日$/)
})

test('服务进度模板字段不受影响，仍走 thing1/thing2/thing6', () => {
  const data = buildSubscribePayload('album', {
    serviceName: '钣金喷漆',
    status: '施工中',
    tips: '可查看现场照片',
  })
  assert.deepEqual(Object.keys(data), ['thing1', 'thing2', 'thing6'])
})

test('变更时间按本地时区格式化，不受 ISO UTC 影响', () => {
  const fixed = new Date(2026, 10, 18, 9, 5, 3)
  assert.equal(formatWechatTime(fixed), '2026-11-18 09:05:03')
})
