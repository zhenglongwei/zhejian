const MINIPROGRAM_CODE_TARGETS = {
  default: { page: 'pages/case/index', scene: 'from=web' },
  'wechat-archive': {
    page: 'packageMerchant/pages/tools/wechat-archive/index',
    scene: 'e=wa',
  },
}

function resolveMiniprogramCodeTarget(entry) {
  const key = String(entry || '').trim()
  if (!key || key === 'default') return MINIPROGRAM_CODE_TARGETS.default
  const target = MINIPROGRAM_CODE_TARGETS[key]
  if (!target) {
    const err = new Error('未知的小程序码入口')
    err.status = 400
    throw err
  }
  return target
}

module.exports = {
  MINIPROGRAM_CODE_TARGETS,
  resolveMiniprogramCodeTarget,
}
