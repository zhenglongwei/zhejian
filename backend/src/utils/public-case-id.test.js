const test = require('node:test')
const assert = require('node:assert/strict')
const { publicCaseIdForAlbum } = require('./public-case-id')

test('keeps an existing public case id', () => {
  assert.equal(
    publicCaseIdForAlbum('alb_svc_mu1c3gzs_598166', 'case_random_abc'),
    'case_random_abc',
  )
})

test('derives a stable id from album when no row exists yet', () => {
  assert.equal(
    publicCaseIdForAlbum('alb_svc_mu1c3gzs_598166'),
    'case_svc_mu1c3gzs_598166',
  )
  assert.equal(publicCaseIdForAlbum('svc_plain'), 'case_svc_plain')
})
