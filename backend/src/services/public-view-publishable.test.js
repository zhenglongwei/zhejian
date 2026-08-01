const test = require('node:test')
const assert = require('node:assert/strict')
const { assertPublicViewPublishable } = require('./public-case.service')

test('assertPublicViewPublishable blocks empty public media (quote-only)', () => {
  assert.throws(
    () =>
      assertPublicViewPublishable(
        { media: [], serviceName: '电瓶更换' },
        { title: '门店｜电瓶更换', caseSummary: '摘要' },
      ),
    (err) => err.code === 'PUBLIC_VIEW_MEDIA_REQUIRED' && err.status === 409,
  )
})

test('assertPublicViewPublishable requires title and summary', () => {
  assert.throws(
    () =>
      assertPublicViewPublishable(
        { media: [{ maskedUrl: 'https://example.com/a.jpg' }] },
        { title: '', caseSummary: '摘要' },
      ),
    (err) => err.code === 'PUBLIC_CASE_TITLE_REQUIRED',
  )
  assert.throws(
    () =>
      assertPublicViewPublishable(
        { media: [{ maskedUrl: 'https://example.com/a.jpg' }] },
        { title: '标题', caseSummary: '' },
      ),
    (err) => err.code === 'PUBLIC_CASE_SUMMARY_REQUIRED',
  )
})

test('assertPublicViewPublishable passes with media + title + summary', () => {
  assert.doesNotThrow(() =>
    assertPublicViewPublishable(
      { media: [{ maskedUrl: 'https://example.com/a.jpg' }], serviceName: '电瓶更换' },
      { title: '门店｜电瓶更换', caseSummary: '摘要说明' },
    ),
  )
})
