/**
 * 读取 apiclient_cert.pem 序列号（Windows 无 openssl 时用）
 *
 *   node scripts/wechat-cert-serial.js "C:\path\to\apiclient_cert.pem"
 */
const fs = require('fs')
const crypto = require('crypto')

const certPath = process.argv[2]
if (!certPath) {
  console.error('用法: node scripts/wechat-cert-serial.js <apiclient_cert.pem 路径>')
  process.exit(1)
}

if (!fs.existsSync(certPath)) {
  console.error('文件不存在:', certPath)
  process.exit(1)
}

const pem = fs.readFileSync(certPath)
const cert = new crypto.X509Certificate(pem)
const serial = String(cert.serialNumber || '')
  .replace(/^serial=/i, '')
  .replace(/:/g, '')
  .trim()
  .toUpperCase()

console.log('证书序列号（写入 WECHAT_PAY_CERT_SERIAL）:')
console.log(serial)
console.log('')
console.log('.env 示例:')
console.log(`WECHAT_PAY_CERT_SERIAL=${serial}`)
