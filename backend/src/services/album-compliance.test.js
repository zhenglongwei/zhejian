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
const { ALBUM_COMPLIANCE_STATUS } = require('../constants/album-compliance')

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

test('isAlbumContentLocked when case review passed without authorization', () => {
  assert.equal(
    isAlbumContentLocked({
      status: 'completed',
      publicCase: { status: 'review_passed' },
    }),
    true
  )
  assert.equal(
    isAlbumContentLocked({
      status: 'completed',
      publicCase: { status: 'pending_review' },
    }),
    true
  )
  assert.equal(
    isAlbumContentLocked({
      status: 'completed',
      publicCase: { status: 'rejected' },
      authorization: null,
    }),
    false
  )
  // 已完工即锁定
  assert.equal(
    isAlbumContentLocked({
      status: 'completed',
      publicCaseStatus: '',
    }),
    true
  )
  // 撤回后仍锁定
  assert.equal(
    isAlbumContentLocked({
      status: 'completed',
      publicCase: { status: 'offline' },
      authorization: { status: 'withdrawn' },
    }),
    true
  )
})

test('buildUserAlbumComplianceFields exposes frozen confirm hint', () => {
  const fields = buildUserAlbumComplianceFields(
    {
      status: 'completed',
      publicCase: { status: 'review_passed' },
      authorization: null,
    },
    { publicCaseScorePass: true },
  )
  assert.equal(fields.contentFrozen, true)
  assert.equal(fields.awaitingUserConfirm, false)
  assert.equal(fields.canAuthorizePublicCase, false)
  assert.equal(fields.canBlockPublicCase, false)
  assert.equal(fields.caseVisibleToOwner, true)
  assert.equal(fields.complianceStatus, 'passed')
})

test('buildUserAlbumComplianceFields notify window can block', () => {
  const fields = buildUserAlbumComplianceFields(
    {
      status: 'completed',
      publicCase: { status: 'notify_window' },
      authorization: null,
    },
    { publicCaseScorePass: true },
  )
  assert.equal(fields.canBlockPublicCase, true)
  assert.equal(fields.canTakedownPublicCase, false)
  assert.equal(fields.canAuthorizePublicCase, false)
})

test('buildUserAlbumComplianceFields hides publish invite when quality not ready', () => {
  const fields = buildUserAlbumComplianceFields(
    {
      status: 'completed',
      publicCase: { status: 'review_passed' },
      authorization: null,
    },
    { publicCaseScorePass: false },
  )
  assert.equal(fields.contentFrozen, true)
  assert.equal(fields.caseVisibleToOwner, true)
  assert.equal(fields.canAuthorizePublicCase, false)
  assert.equal(fields.awaitingUserConfirm, false)
  assert.equal(fields.userConfirmHint, '')
})

test('buildUserAlbumComplianceFields keeps album visible before review passed', () => {
  const pending = buildUserAlbumComplianceFields(
    {
      status: 'completed',
      publicCase: { status: 'pending_review' },
      authorization: null,
    },
    { publicCaseScorePass: true },
  )
  assert.equal(pending.caseVisibleToOwner, true)
  assert.equal(pending.ownerAlbumLocked, false)
  assert.equal(pending.canAuthorizePublicCase, false)
  assert.ok(pending.compliancePendingHint)
  assert.equal(pending.complianceStatus, 'pending')
})

test('shouldSpotCheckAlbum is deterministic for album id', () => {
  const a = shouldSpotCheckAlbum('alb_demo_1')
  const b = shouldSpotCheckAlbum('alb_demo_1')
  assert.equal(a, b)
})
