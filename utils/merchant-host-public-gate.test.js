const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildHostPublicGatePrompt,
  buildPublicPathBlockedPrompt,
  hostAlbumUrl,
} = require('./merchant-host-public-gate')

const gateAuth = {
  ready: false,
  reasonKey: 'needAuth',
  title: '先完成认证',
  message: '上传执照和身份证后，档案才能出现在网站上。',
  action: 'auth',
  actionLabel: '去认证',
}

test('incomplete host click asks to fill auth and allows private', () => {
  const prompt = buildHostPublicGatePrompt({
    publicGate: gateAuth,
    hosted: false,
  })
  assert.equal(prompt.kind, 'incomplete')
  assert.equal(prompt.confirmText, '去认证')
  assert.equal(prompt.cancelText, '先仅私密')
  assert.equal(prompt.privateMode, true)
})

test('listed-off after losing profile completeness names the missing items', () => {
  const prompt = buildHostPublicGatePrompt({
    publicGate: {
      ready: false,
      reasonKey: 'needProfile',
      title: '先补门店资料',
      message: '还缺门头照片、工位照片。',
      action: 'profile',
      actionLabel: '去补资料',
    },
    hosted: true,
    hostVisibility: 'public',
    onPublicWeb: false,
  })
  assert.equal(prompt.kind, 'listedOff')
  assert.match(prompt.content, /门头/)
  assert.equal(prompt.confirmText, '去补资料')
})

test('listed-off public host explains why and still opens archive', () => {
  const prompt = buildHostPublicGatePrompt({
    publicGate: {
      ready: false,
      reasonKey: 'authFailed',
      title: '认证未通过',
      message: '认证未通过，请重拍证件。',
      action: 'auth',
      actionLabel: '去认证',
    },
    hosted: true,
    hostVisibility: 'public',
    onPublicWeb: false,
  })
  assert.equal(prompt.kind, 'listedOff')
  assert.equal(prompt.title, '网站上看不到')
  assert.match(prompt.content, /重拍/)
  assert.equal(prompt.openHost, true)
  assert.equal(prompt.privateMode, false)
})

test('ready store skips the prompt', () => {
  assert.equal(
    buildHostPublicGatePrompt({
      publicGate: { ready: true },
      hosted: false,
    }),
    null,
  )
})

test('private hosted does not nag', () => {
  assert.equal(
    buildHostPublicGatePrompt({
      publicGate: gateAuth,
      hosted: true,
      hostVisibility: 'private',
      onPublicWeb: false,
    }),
    null,
  )
})

test('hosted public without onPublicWeb flag does not assume listed-off', () => {
  assert.equal(
    buildHostPublicGatePrompt({
      publicGate: gateAuth,
      hosted: true,
      hostVisibility: 'public',
    }),
    null,
  )
})

test('host url can lock private mode', () => {
  assert.equal(
    hostAlbumUrl('alb_1', 'private'),
    '/packageMerchant/pages/album/host/index?albumId=alb_1&mode=private',
  )
})

test('public path on host page is blocked with the same reason', () => {
  const prompt = buildPublicPathBlockedPrompt(gateAuth)
  assert.equal(prompt.title, '先完成认证')
  assert.equal(prompt.confirmText, '去认证')
  assert.equal(buildPublicPathBlockedPrompt({ ready: true }), null)
})
