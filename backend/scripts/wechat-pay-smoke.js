/**
 * 微信支付 V3 配置诊断
 *
 *   cd /var/www/zhejian/backend
 *   node scripts/wechat-pay-smoke.js
 */
const fs = require('fs')
const crypto = require('crypto')
const { config } = require('../src/config')
const {
  probeWechatPayAuth,
  normalizeCertSerial,
  getSigningPrivateKey,
} = require('../src/lib/wechat-pay')

function mask(value, keep = 4) {
  const s = String(value || '')
  if (s.length <= keep * 2) return '***'
  return `${s.slice(0, keep)}…${s.slice(-keep)}`
}

function loadWechatPublicKey() {
  const pem = String(config.wechatPay.publicKey || '').trim()
  if (!pem) return null
  try {
    return crypto.createPublicKey({ key: pem, format: 'pem' })
  } catch (e) {
    return null
  }
}

function printPublicKeyModeOk() {
  console.log('✅ 微信支付公钥模式已配置（无需 GET /v3/certificates）')
  console.log('  publicKeyId:', config.wechatPay.publicKeyId)
  console.log('  publicKey:', config.wechatPay.publicKey ? '已加载' : '(空)')
  console.log('')
  console.log('商户 API 证书签名（apiclient_key.pem）用于你方请求微信；')
  console.log('微信支付公钥用于验证微信回调/应答（支付回调解密仍用 APIv3 密钥）。')
  console.log('')
  console.log('下一步：pm2 restart zhejian-api --update-env')
  console.log('然后在小程序「套餐与公域收录」试真实支付。')
}

async function main() {
  console.log('=== 微信支付配置检查 ===')
  console.log('configured:', config.wechatPay.configured)
  console.log('publicKeyMode:', config.wechatPay.publicKeyMode)
  console.log('mchId:', config.wechatPay.mchId || '(空)')
  console.log('appId:', config.wechat.appId || '(空)')
  console.log('certSerial(norm):', normalizeCertSerial(config.wechatPay.certSerial) || '(空)')
  console.log('publicKeyId:', config.wechatPay.publicKeyId || '(空)')
  console.log('notifyUrl:', config.wechatPay.notifyUrl)
  console.log('apiV3Key:', mask(config.wechatPay.apiV3Key, 6))
  console.log('privateKey:', config.wechatPay.privateKey ? '已加载' : '(空)')
  console.log('wechatPublicKey:', config.wechatPay.publicKey ? '已加载' : '(空)')

  if (!config.wechatPay.configured) {
    console.error('\n❌ 配置不完整，请检查 .env 中 WECHAT_PAY_* 与 WECHAT_APP_ID')
    process.exit(1)
  }

  try {
    const key = getSigningPrivateKey()
    console.log('privateKeyType:', key.asymmetricKeyType)
  } catch (e) {
    console.error('\n❌ 私钥解析失败:', e.message)
    process.exit(1)
  }

  if (config.wechatPay.publicKeyId && !loadWechatPublicKey()) {
    console.error('\n❌ 已配置 WECHAT_PAY_PUBLIC_KEY_ID 但公钥文件无效')
    console.error('请从商户平台「微信支付公钥 → 重新下载」，保存为 secrets/wechat_pub_key.pem')
    process.exit(1)
  }

  if (config.wechatPay.publicKeyMode) {
    printPublicKeyModeOk()
    process.exit(0)
  }

  console.log('\n正在请求 GET /v3/certificates（仅平台证书模式可用）…')
  try {
    const result = await probeWechatPayAuth()
    console.log('✅ 验签通过:', JSON.stringify(result, null, 2))
  } catch (e) {
    const apiCode = e.code || (e.details && e.details.code)
    if (apiCode === 'RESOURCE_NOT_EXISTS') {
      console.log('✅ 商户 API 证书签名已通过（微信已识别商户身份）')
      console.log('')
      console.log('当前为「微信支付公钥」模式，GET /v3/certificates 不可用 — 这是正常的。')
      console.log('请在 .env 补充（从商户平台「API安全 → 微信支付公钥」）：')
      console.log('  WECHAT_PAY_PUBLIC_KEY_ID=PUB_KEY_ID_01167592714420260321001922')
      console.log('  WECHAT_PAY_PUBLIC_KEY_PATH=/var/www/zhejian/backend/secrets/wechat_pub_key.pem')
      console.log('')
      console.log('公钥文件：商户平台点击「重新下载」，解压得到 pub_key.pem（或类似名称）')
      console.log('')
      console.log('即使暂不配公钥文件，也可先 pm2 restart 后在小程序试 JSAPI 支付。')
      process.exit(0)
    }
    console.error('\n❌ 请求失败:', e.message)
    if (e.details) console.error('details:', e.details)
    process.exit(1)
  }
}

main()
