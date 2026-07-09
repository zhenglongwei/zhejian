#!/usr/bin/env node
/**
 * Phase 0 · 生产环境安全配置核查（只读，不输出密钥明文）
 *
 * 用法：
 *   node scripts/check-production-env.js              # 读 backend/.env
 *   node scripts/check-production-env.js --strict       # 按 production 标准严格检查
 *   node scripts/check-production-env.js --probe URL    # 远程探测 dev 鉴权是否关闭
 *   npm run check:prod-env
 *   npm run check:prod-env -- --probe https://geo.simplewin.cn
 */
const path = require('path')
const fs = require('fs')

require('dotenv').config({ path: path.join(__dirname, '../.env') })

const STRICT = process.argv.includes('--strict')
const probeArgIdx = process.argv.indexOf('--probe')
const PROBE_BASE =
  probeArgIdx >= 0 ? String(process.argv[probeArgIdx + 1] || '').replace(/\/$/, '') : ''

const KNOWN_WEAK = {
  DEV_USER_TOKEN: ['dev_user_token_change_me'],
  DEV_MERCHANT_TOKEN: ['dev_merchant_token_change_me'],
  DEV_SYSTEM_TOKEN: ['dev_system_token_change_me'],
  DEV_ADMIN_TOKEN: ['dev_system_token_change_me'],
  ADMIN_PASSWORD: ['admin_change_me'],
  JWT_SECRET: ['', 'change_me_to_random_secret_in_production'],
}

const MIN_LEN = {
  JWT_SECRET: 32,
  ADMIN_PASSWORD: 12,
  DEV_USER_TOKEN: 24,
  DEV_MERCHANT_TOKEN: 24,
  DEV_SYSTEM_TOKEN: 24,
  DEV_ADMIN_TOKEN: 24,
  CRAWLER_INGEST_TOKEN: 16,
}

/** @type {{ level: 'CRIT'|'HIGH'|'MED'|'OK'|'INFO', id: string, message: string }[]} */
const findings = []

function env(name) {
  const raw = process.env[name]
  if (raw == null || raw === '') return ''
  return String(raw).trim()
}

function envBool(name, defaultValue = false) {
  const raw = process.env[name]
  if (raw == null || raw === '') return defaultValue
  return String(raw).trim().toLowerCase() === 'true'
}

function isProductionContext() {
  if (STRICT) return true
  return env('NODE_ENV').toLowerCase() === 'production'
}

function maskHint(value, name) {
  if (!value) return '(未设置)'
  if (KNOWN_WEAK[name]?.includes(value)) return '(已知弱默认值)'
  if (value.length < (MIN_LEN[name] || 8)) return `(过短: ${value.length} 字符)`
  return `(已设置, ${value.length} 字符)`
}

function add(level, id, message) {
  findings.push({ level, id, message })
}

function checkSecret(name, { requiredInProd = true, minLen } = {}) {
  const value = env(name)
  const prod = isProductionContext()
  const weakList = KNOWN_WEAK[name] || []
  const min = minLen ?? MIN_LEN[name] ?? 8

  if (!value) {
    if (prod && requiredInProd) {
      add('CRIT', name, `${name} 未设置`)
    } else {
      add('INFO', name, `${name} 未设置（非生产可接受）`)
    }
    return
  }

  if (weakList.includes(value)) {
    add('CRIT', name, `${name} 仍为已知弱默认值 ${maskHint(value, name)}`)
    return
  }

  if (value.length < min) {
    add('CRIT', name, `${name} 长度不足（需 ≥${min}）${maskHint(value, name)}`)
    return
  }

  add('OK', name, `${name} ${maskHint(value, name)}`)
}

function checkEnvFile() {
  const envPath = path.join(__dirname, '../.env')
  if (!fs.existsSync(envPath)) {
    add('CRIT', 'ENV_FILE', `未找到 ${envPath}，请在服务器 backend/ 目录执行`)
    return
  }
  add('OK', 'ENV_FILE', `.env 存在 (${envPath})`)
}

function checkDatabaseUrl() {
  const url = env('DATABASE_URL')
  if (!url) {
    add('CRIT', 'DATABASE_URL', 'DATABASE_URL 未设置')
    return
  }
  if (/YOUR_PASSWORD|change_me|password@/i.test(url)) {
    add('CRIT', 'DATABASE_URL', 'DATABASE_URL 含占位符或弱密码片段')
    return
  }
  if (isProductionContext() && /@127\.0\.0\.1|@localhost/i.test(url)) {
    add('OK', 'DATABASE_URL', 'DATABASE_URL 指向本机 MySQL（符合同机部署）')
  } else {
    add('OK', 'DATABASE_URL', 'DATABASE_URL 已配置')
  }
}

function checkDevAuth() {
  const enabled = env('DEV_AUTH_ENABLED') !== 'false'
  const prod = isProductionContext()

  if (enabled && prod) {
    add('CRIT', 'DEV_AUTH_ENABLED', '生产环境 DEV_AUTH_ENABLED 必须为 false（当前为开启或未显式关闭）')
  } else if (enabled) {
    add('MED', 'DEV_AUTH_ENABLED', 'DEV_AUTH_ENABLED=true（开发环境可接受，上线前务必 false）')
  } else {
    add('OK', 'DEV_AUTH_ENABLED', 'DEV_AUTH_ENABLED=false')
  }

  if (enabled) {
    ;['DEV_USER_TOKEN', 'DEV_MERCHANT_TOKEN', 'DEV_SYSTEM_TOKEN', 'DEV_ADMIN_TOKEN'].forEach((name) => {
      checkSecret(name, { requiredInProd: false })
    })
  } else {
    add('OK', 'DEV_TOKENS', 'dev 鉴权已关闭，跳过 dev token 检查')
  }
}

function checkAdminAndJwt() {
  checkSecret('JWT_SECRET')
  checkSecret('ADMIN_PASSWORD')

  if (isProductionContext() && !env('JWT_SECRET') && env('DEV_AUTH_ENABLED') === 'false') {
    add('CRIT', 'JWT_AUTH', 'DEV_AUTH 已关但 JWT_SECRET 未设，运营/用户登录将无法工作')
  }
}

function checkWechatPay() {
  const testCents = env('WECHAT_PAY_SUBSCRIPTION_TEST_AMOUNT_CENTS')
  if (testCents && isProductionContext()) {
    add('CRIT', 'WECHAT_PAY_TEST', `WECHAT_PAY_SUBSCRIPTION_TEST_AMOUNT_CENTS=${testCents}（生产禁止开启 1 分联调）`)
  } else if (testCents) {
    add('MED', 'WECHAT_PAY_TEST', `WECHAT_PAY_SUBSCRIPTION_TEST_AMOUNT_CENTS=${testCents}（仅联调）`)
  } else {
    add('OK', 'WECHAT_PAY_TEST', '未设置测试金额（正常套餐价）')
  }

  const payConfigured =
    env('WECHAT_PAY_MCH_ID') &&
    env('WECHAT_PAY_API_V3_KEY') &&
    env('WECHAT_PAY_CERT_SERIAL') &&
    (env('WECHAT_PAY_PRIVATE_KEY') || env('WECHAT_PAY_PRIVATE_KEY_PATH'))

  if (isProductionContext() && !payConfigured) {
    add('MED', 'WECHAT_PAY', '微信支付未完整配置（若未上线付费可暂缓）')
  } else if (payConfigured) {
    add('OK', 'WECHAT_PAY', '微信支付关键项已配置')
  }
}

function checkBusinessFlags() {
  const autoApprove = env('MERCHANT_AUTO_APPROVE') !== 'false'
  if (autoApprove && isProductionContext()) {
    add('HIGH', 'MERCHANT_AUTO_APPROVE', 'MERCHANT_AUTO_APPROVE 未显式 false（商家入驻将自动通过）')
  } else if (!autoApprove) {
    add('OK', 'MERCHANT_AUTO_APPROVE', 'MERCHANT_AUTO_APPROVE=false')
  }

  if (envBool('MERCHANT_OWNER_PHONE_TEST') && isProductionContext()) {
    add('HIGH', 'MERCHANT_OWNER_PHONE_TEST', 'MERCHANT_OWNER_PHONE_TEST=true（生产应关闭）')
  } else if (!envBool('MERCHANT_OWNER_PHONE_TEST')) {
    add('OK', 'MERCHANT_OWNER_PHONE_TEST', '未开启测试手机号')
  }
}

function checkCrawlerIngest() {
  const token = env('CRAWLER_INGEST_TOKEN')
  if (isProductionContext() && !token) {
    add('MED', 'CRAWLER_INGEST_TOKEN', '未设置（爬虫日志 ingest 接口对匿名开放）')
  } else if (token) {
    if (token.length < MIN_LEN.CRAWLER_INGEST_TOKEN) {
      add('MED', 'CRAWLER_INGEST_TOKEN', `token 过短 (${token.length} 字符)`)
    } else {
      add('OK', 'CRAWLER_INGEST_TOKEN', `已设置 (${token.length} 字符)`)
    }
  }
}

function checkDesensitize() {
  const engine = env('DESENSITIZE_ENGINE') || 'aliyun'
  if (isProductionContext() && engine === 'dev') {
    add('CRIT', 'DESENSITIZE_ENGINE', 'DESENSITIZE_ENGINE=dev（生产必须使用 aliyun）')
  } else {
    add('OK', 'DESENSITIZE_ENGINE', `DESENSITIZE_ENGINE=${engine}`)
  }
}

function checkWechatMini() {
  if (isProductionContext()) {
    if (!env('WECHAT_APP_ID') || !env('WECHAT_APP_SECRET')) {
      add('HIGH', 'WECHAT_APP', 'WECHAT_APP_ID / WECHAT_APP_SECRET 未完整配置')
    } else {
      add('OK', 'WECHAT_APP', '微信小程序凭证已配置')
    }
  }
}

async function probeRemote(base) {
  console.log(`\n── 远程探测 ${base} ──`)

  async function tryAuth(path, token, label) {
    const url = `${base}/api/v1${path}`
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })
      const body = await res.json().catch(() => ({}))
      const accepted = res.status === 200 && body && body.code === 0
      if (accepted) {
        add('CRIT', `PROBE_${label}`, `默认 dev token 仍可用: ${path} → HTTP ${res.status}`)
      } else {
        add('OK', `PROBE_${label}`, `默认 dev token 已拒绝: ${path} → HTTP ${res.status}`)
      }
    } catch (e) {
      add('MED', `PROBE_${label}`, `探测失败: ${e.message}`)
    }
  }

  await tryAuth('/user/account/deactivate-check', 'dev_user_token_change_me', 'DEV_USER')
  await tryAuth('/merchant/stats/summary', 'dev_merchant_token_change_me', 'DEV_MERCHANT')

  try {
    const res = await fetch(`${base}/api/v1/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ password: 'admin_change_me' }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.status === 200 && body && body.code === 0 && body.data?.token) {
      add('CRIT', 'PROBE_ADMIN', '默认运营密码 admin_change_me 仍可登录')
    } else {
      add('OK', 'PROBE_ADMIN', `默认运营密码已拒绝 → HTTP ${res.status}`)
    }
  } catch (e) {
    add('MED', 'PROBE_ADMIN', `运营登录探测失败: ${e.message}`)
  }
}

function printReport() {
  const icon = { CRIT: '🔴', HIGH: '🟠', MED: '🟡', OK: '🟢', INFO: '⚪' }
  const order = { CRIT: 0, HIGH: 1, MED: 2, INFO: 3, OK: 4 }
  const sorted = [...findings].sort((a, b) => order[a.level] - order[a.level] || a.id.localeCompare(b.id))

  console.log('\n══════════════════════════════════════════')
  console.log(' 辙见 · Phase 0 生产环境安全配置核查')
  console.log('══════════════════════════════════════════')
  console.log(`NODE_ENV=${env('NODE_ENV') || '(未设置)'}  严格模式=${STRICT ? '是' : '否'}`)
  console.log('（不输出密钥明文）\n')

  for (const f of sorted) {
    console.log(`${icon[f.level] || '·'} [${f.level.padEnd(4)}] ${f.id}: ${f.message}`)
  }

  const crit = findings.filter((f) => f.level === 'CRIT').length
  const high = findings.filter((f) => f.level === 'HIGH').length
  const med = findings.filter((f) => f.level === 'MED').length
  const ok = findings.filter((f) => f.level === 'OK').length

  console.log('\n──────────────────────────────────────────')
  console.log(`汇总: CRIT=${crit}  HIGH=${high}  MED=${med}  OK=${ok}`)
  if (crit > 0) {
    console.log('\n❌ 存在 Critical 项，生产环境不可上线，请先修正 .env 后 pm2 restart')
    process.exit(1)
  }
  if (high > 0 && isProductionContext()) {
    console.log('\n⚠️  存在 High 项，建议上线前处理')
    process.exit(2)
  }
  console.log('\n✅ 未发现 Critical 项')
}

async function main() {
  checkEnvFile()
  checkDatabaseUrl()
  checkDevAuth()
  checkAdminAndJwt()
  checkWechatPay()
  checkBusinessFlags()
  checkCrawlerIngest()
  checkDesensitize()
  checkWechatMini()

  if (PROBE_BASE) {
    await probeRemote(PROBE_BASE)
  } else if (isProductionContext()) {
    const base = env('PUBLIC_BASE_URL') || 'https://geo.simplewin.cn'
    console.log(`\n提示: 可加 --probe ${base} 远程验证 dev 鉴权是否关闭`)
  }

  printReport()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
