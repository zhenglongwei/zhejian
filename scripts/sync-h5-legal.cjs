/**
 * 同步小程序 L1 协议到 H5 静态 JSON
 * 运行：node scripts/sync-h5-legal.cjs
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'h5/shared/legal-content.json')

const { PRIVACY_POLICY, USER_AGREEMENT } = require(path.join(ROOT, 'constants/settings-legal'))

const payload = {
  privacy: PRIVACY_POLICY,
  terms: USER_AGREEMENT,
  syncedAt: new Date().toISOString(),
}

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8')
console.log('[sync-h5-legal] wrote', OUT)
