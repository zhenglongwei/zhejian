/**
 * 分享卡片标题口径回归：辙见是门店的工具，卡片主语应该是门店。
 * 运行：node utils/share-title.test.js
 */
const test = require('node:test')
const assert = require('node:assert/strict')

const { resolveShareStoreName, buildStoreFallbackTitle } = require('./share-title')
const { buildShareTitle } = require('./album-owner-share')
const { buildCaseShareTitle, buildPublicCaseSocialCopy } = require('./case-share')
const { buildStoreShareTitle } = require('./store-share')

test('门店名兼容 storeName 与 store.name 两种形态', () => {
  assert.equal(resolveShareStoreName({ storeName: '盈简科技' }), '盈简科技')
  assert.equal(resolveShareStoreName({ store: { name: '盈简科技' } }), '盈简科技')
  assert.equal(resolveShareStoreName({}), '')
  assert.equal(resolveShareStoreName(), '')
})

test('拿不到门店名时只留后缀，不挂平台名', () => {
  assert.equal(buildStoreFallbackTitle('盈简科技', '我的服务相册'), '盈简科技 · 我的服务相册')
  assert.equal(buildStoreFallbackTitle('', '我的服务相册'), '我的服务相册')
})

test('车主分享相册卡片以门店名打头', () => {
  const title = buildShareTitle({
    storeName: '盈简科技',
    serviceName: '刹车维修',
    imageCount: 12,
  })
  assert.equal(title, '盈简科技｜【刹车维修】12张过程图，修车前值得一看')
  assert.ok(!title.includes('辙见'))
})

test('公开案例卡片与社交文案首行都不再出现平台名', () => {
  const title = buildCaseShareTitle({ title: '异响排查', storeName: '盈简科技' })
  assert.equal(title, '盈简科技｜【异响排查】脱敏维修过程参考，修车前值得一看')
  const copy = buildPublicCaseSocialCopy({ title: '异响排查', storeName: '盈简科技' }, 'https://x/y')
  const lines = copy.split('\n')
  assert.equal(lines[0], '公开维修案例 · 【异响排查】')
  assert.equal(lines[1], '来自【盈简科技】，门店放到店页的打码施工说明。')
  assert.ok(!lines[0].includes('辙见'))
})

test('门店资料卡片去掉尾部平台署名', () => {
  assert.equal(buildStoreShareTitle({ name: '盈简科技' }), '【盈简科技】门店资料')
})
