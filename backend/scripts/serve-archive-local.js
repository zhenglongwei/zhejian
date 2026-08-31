/**
 * 本地跑微信群归档工具（不碰数据库、不碰小程序，只挂页面 + 接口）
 *
 *   cd backend && node scripts/serve-archive-local.js
 *
 *   公开试用页（官网那个）： http://127.0.0.1:8848/archive.html
 *   内部完整版（带编辑/草稿箱）： http://127.0.0.1:8848/tools/wechat-archive.html
 *
 * 密钥读 backend/.env 里的 WECHAT_ARCHIVE_API_KEY / GEO_LLM_API_KEY / DASHSCOPE_API_KEY。
 * 一个都没配的话，页面第 1–2 步（解析 + 脱敏）照样能用，需要模型的那几步会提示去配密钥。
 *
 * 只想确认页面长什么样、不想配密钥：
 *   WECHAT_ARCHIVE_API_KEY=随便填 node scripts/serve-archive-local.js
 *
 * 用法可选：PORT=9000 node scripts/serve-archive-local.js
 */
const path = require('path')
const express = require('express')
const { router: internalRouter } = require('../src/routes/internal-wechat-archive')
const { router: publicRouter } = require('../src/routes/public-wechat-archive')

const PORT = Number(process.env.PORT || 8848)
const BRAND_WEB = path.join(__dirname, '..', '..', 'brand-web')
const INTERNAL_PAGE = path.join(__dirname, '..', '..', 'scripts', 'geo-case-archive', 'archiver.html')

const app = express()
app.use(express.json({ limit: '8mb' }))
app.use((req, res, next) => {
  res.locals.requestId = `local_${Date.now().toString(36)}`
  next()
})

// 内部版页面（不在 brand-web 里，单独挂）
app.get('/tools/wechat-archive.html', (req, res) => res.sendFile(INTERNAL_PAGE))

// 公开版：整站同源托管，archive.js 在本地走的就是同源接口
app.use(express.static(BRAND_WEB))

app.use('/api/v1/internal', internalRouter)
app.use('/api/v1/public', publicRouter)

app.use((err, req, res, next) => {
  console.error('[archive-local]', err)
  res.status(500).json({ code: 500, message: err.message, request_id: res.locals.requestId })
})

app.listen(PORT, () => {
  console.log('')
  console.log(`公开试用页（官网版）  http://127.0.0.1:${PORT}/archive.html`)
  console.log(`内部完整版           http://127.0.0.1:${PORT}/tools/wechat-archive.html`)
  console.log('')
  console.log('提示：想指向单独跑着的 backend，公开页加 ?api=http://127.0.0.1:3000/api/v1/public/wechat-archive')
})
