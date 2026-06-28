/**
 * 微信支付 V3 配置诊断（验签失败时在生产机执行）
 *
 *   cd /var/www/zhejian/backend
 *   node scripts/wechat-pay-smoke.js
 */
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

async function main() {
  console.log('=== 微信支付配置检查 ===')
  console.log('configured:', config.wechatPay.configured)
  console.log('mchId:', config.wechatPay.mchId || '(空)')
  console.log('appId:', config.wechat.appId || '(空)')
  console.log('certSerial(raw):', config.wechatPay.certSerial || '(空)')
  console.log('certSerial(norm):', normalizeCertSerial(config.wechatPay.certSerial) || '(空)')
  console.log('notifyUrl:', config.wechatPay.notifyUrl)
  console.log('apiV3Key:', mask(config.wechatPay.apiV3Key, 6))
  console.log('privateKey:', config.wechatPay.privateKey ? '已加载' : '(空)')

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

  console.log('\n正在请求 GET /v3/certificates 验证签名…')
  try {
    const result = await probeWechatPayAuth()
    console.log('✅ 验签通过:', JSON.stringify(result, null, 2))
    console.log(
      '\n若 JSAPI 仍失败，请核对：小程序 AppID 已绑定该商户号、JSAPI 支付已开通、openid 属于该小程序。'
    )
  } catch (e) {
    const apiCode = e.code || (e.details && e.details.code)
    if (apiCode === 'RESOURCE_NOT_EXISTS') {
      console.log('✅ 商户请求签名已通过（微信已识别商户身份）')
      console.log('⚠️  平台侧未配置「微信支付公钥」，GET /v3/certificates 不可用，不影响 JSAPI 下单。')
      console.log('')
      console.log('建议在商户平台完成（支付回调验签更完整）：')
      console.log('  登录 pay.weixin.qq.com → 账户中心 → API安全 → 微信支付公钥 → 申请/启用')
      console.log('  指引: https://pay.weixin.qq.com/doc/v3/merchant/4012153196')
      console.log('')
      console.log('下一步：pm2 restart zhejian-api --update-env 后，在小程序「套餐与公域收录」试真实支付。')
      process.exit(0)
    }
    console.error('\n❌ 验签失败:', e.message)
    if (apiCode === 'SIGN_ERROR') {
      console.error('\n常见原因：')
      console.error('1. WECHAT_PAY_CERT_SERIAL 不是 apiclient_cert.pem 的序列号（需大写、无冒号）')
      console.error('   openssl x509 -in apiclient_cert.pem -noout -serial')
      console.error('2. WECHAT_PAY_PRIVATE_KEY 不是同一次下载的 apiclient_key.pem')
      console.error('3. 商户号 WECHAT_PAY_MCH_ID 与证书所属商户不一致')
      console.error('4. pm2 未加载新 .env：pm2 restart zhejian-api --update-env')
    }
    if (e.details) console.error('details:', e.details)
    process.exit(1)
  }
}

main()
