/**
 * 本地跑微信群归档工具（不碰数据库、不碰小程序，只挂页面 + 接口）
 *
 *   cd backend && node scripts/serve-archive-local.js
 *
 *   页面： http://127.0.0.1:8848/archive.html
 *
 * 密钥读 backend/.env 里的 WECHAT_ARCHIVE_API_KEY / GEO_LLM_API_KEY / DASHSCOPE_API_KEY。
 * 一个都没配的话，解析 + 脱敏照样能用，需要模型的步骤会提示去配密钥。
 *
 * 只想确认页面长什么样、不想配密钥：
 *   WECHAT_ARCHIVE_API_KEY=随便填 node scripts/serve-archive-local.js
 *
 * 用法可选：PORT=9000 node scripts/serve-archive-local.js
 */
const path = require('path')
const express = require('express')
const { router: publicRouter } = require('../src/routes/public-wechat-archive')

const PORT = Number(process.env.PORT || 8848)
const BRAND_WEB = path.join(__dirname, '..', '..', 'brand-web')

const app = express()
app.use(express.json({ limit: '8mb' }))
app.use((req, res, next) => {
  res.locals.requestId = `local_${Date.now().toString(36)}`
  next()
})

// 公开版：整站同源托管，archive.js 在本地走的就是同源接口
app.use(express.static(BRAND_WEB))

app.use('/api/v1/public', publicRouter)

app.use((err, req, res, next) => {
  console.error('[archive-local]', err)
  res.status(500).json({ code: 500, message: err.message, request_id: res.locals.requestId })
})

app.listen(PORT, () => {
  console.log('')
  console.log(`页面 http://127.0.0.1:${PORT}/archive.html`)
  console.log('')
})
