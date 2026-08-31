/**
 * 本地跑微信群归档工具（不碰数据库、不碰小程序，只挂一个页面 + 四个接口）
 *
 *   cd backend && node scripts/serve-archive-local.js
 *   然后打开 http://127.0.0.1:8848/tools/wechat-archive.html
 *
 * 密钥读 backend/.env 里的 WECHAT_ARCHIVE_API_KEY / GEO_LLM_API_KEY / DASHSCOPE_API_KEY。
 * 一个都没配的话，页面第 1–2 步（解析 + 脱敏）照样能用，第 3/5 步会提示去配密钥。
 *
 * 用法可选：PORT=9000 node scripts/serve-archive-local.js
 */
const path = require('path')
const express = require('express')
const { router } = require('../src/routes/internal-wechat-archive')

const PORT = Number(process.env.PORT || 8848)
const PAGE = path.join(__dirname, '..', '..', 'scripts', 'geo-case-archive', 'archiver.html')

const app = express()
app.use(express.json({ limit: '8mb' }))
app.use((req, res, next) => {
  res.locals.requestId = `local_${Date.now().toString(36)}`
  next()
})
app.get('/tools/wechat-archive.html', (req, res) => res.sendFile(PAGE))
app.use('/api/v1/internal', router)
app.use((err, req, res, next) => {
  console.error('[archive-local]', err)
  res.status(500).json({ code: 500, message: err.message, request_id: res.locals.requestId })
})

app.listen(PORT, () => {
  console.log(`微信群归档工具： http://127.0.0.1:${PORT}/tools/wechat-archive.html`)
})
