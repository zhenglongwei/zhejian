const test = require('node:test')
const assert = require('node:assert/strict')
const {
  evaluateAlbumComplianceRules,
  assertAlbumCompliancePassed,
  shouldSpotCheckAlbum,
} = require('./album-compliance.service')
const {
  isAlbumContentLocked,
  buildUserAlbumComplianceFields,
} = require('./service-album.service')
const {
  ALBUM_COMPLIANCE_STATUS,
  USER_CONFIRM_HINT,
} = require('../constants/album-compliance')

test('evaluateAlbumComplianceRules flags banned phrase', () => {
  const result = evaluateAlbumComplianceRules({
    serviceName: '钣金喷漆',
    storeNote: '全网最低价格',
    nodes: [],
  })
  assert.equal(result.passed, false)
  assert.ok(result.summary.includes('全网最低'))
})

test('evaluateAlbumComplianceRules flags external wechat', () => {
  const result = evaluateAlbumComplianceRules({
    serviceName: '保养',
    storeNote: '',
    nodes: [{ title: '备注', note: '有问题加微信咨询' }],
  })
  assert.equal(result.passed, false)
})

test('evaluateAlbumComplianceRules passes clean album', () => {
  const result = evaluateAlbumComplianceRules({
    serviceName: '刹车片更换',
    storeNote: '已检查刹车片磨损',
    nodes: [{ title: '接车', note: '车主反映制动偏软' }],
  })
  assert.equal(result.passed, true)
})

test('assertAlbumCompliancePassed blocks pending and rejected', () => {
  assert.throws(
    () => assertAlbumCompliancePassed({ complianceStatus: ALBUM_COMPLIANCE_STATUS.PENDING }),
    (err) => err.code === 'ALBUM_COMPLIANCE_PENDING'
  )
  assert.throws(
    () =>
      assertAlbumCompliancePassed({
        complianceStatus: ALBUM_COMPLIANCE_STATUS.REJECTED,
        complianceRejectReason: '含违规表述',
      }),
    (err) => err.code === 'ALBUM_COMPLIANCE_REJECTED'
  )
  assert.doesNotThrow(() =>
    assertAlbumCompliancePassed({ complianceStatus: ALBUM_COMPLIANCE_STATUS.PASSED })
  )
})

test('isAlbumContentLocked when compliance passed without authorization', () => {
  assert.equal(
    isAlbumContentLocked({ complianceStatus: ALBUM_COMPLIANCE_STATUS.PASSED }),
    true
  )
  assert.equal(
    isAlbumContentLocked({
      status: 'completed',
      complianceStatus: ALBUM_COMPLIANCE_STATUS.PENDING,
    }),
    true
  )
  assert.equal(
    isAlbumContentLocked({
      complianceStatus: ALBUM_COMPLIANCE_STATUS.REJECTED,
      authorization: null,
    }),
    false
  )
  // 已完工即锁定（含合规态尚未写入 / 撤回后仍 completed）
  assert.equal(
    isAlbumContentLocked({
      status: 'completed',
      complianceStatus: ALBUM_COMPLIANCE_STATUS.NONE,
    }),
    true
  )
  // 撤回后仍保持 passed → 仍锁定
  assert.equal(
    isAlbumContentLocked({
      status: 'completed',
      complianceStatus: ALBUM_COMPLIANCE_STATUS.PASSED,
      authorization: { status: 'withdrawn' },
    }),
    true
  )
})

test('buildUserAlbumComplianceFields exposes frozen confirm hint', () => {
  const fields = buildUserAlbumComplianceFields(
    {
      status: 'completed',
      complianceStatus: ALBUM_COMPLIANCE_STATUS.PASSED,
      authorization: null,
    },
    { publicCaseScorePass: true },
  )
  assert.equal(fields.contentFrozen, true)
  assert.equal(fields.awaitingUserConfirm, true)
  assert.equal(fields.userConfirmHint, USER_CONFIRM_HINT)
  assert.equal(fields.canAuthorizePublicCase, true)
  assert.equal(fields.caseVisibleToOwner, true)
})

test('buildUserAlbumComplianceFields hides case before compliance passed', () => {
  const pending = buildUserAlbumComplianceFields(
    {
      status: 'completed',
      complianceStatus: ALBUM_COMPLIANCE_STATUS.PENDING,
      authorization: null,
    },
    { publicCaseScorePass: true },
  )
  assert.equal(pending.caseVisibleToOwner, false)
  assert.equal(pending.canAuthorizePublicCase, false)
  assert.ok(pending.compliancePendingHint)
})

test('shouldSpotCheckAlbum is deterministic for album id', () => {
  const a = shouldSpotCheckAlbum('alb_demo_1')
  const b = shouldSpotCheckAlbum('alb_demo_1')
  assert.equal(a, b)
})
