/**
 *  diagnose-check-flow.js — 体检页全流程渲染冒烟（带桩接口）
 *
 *  为什么需要这个脚本：体检第一步要调百度、通义、混元、豆包四个外部接口，
 *  本机通常一个密钥都没配，页面只会显示「后端还没配检索密钥」。
 *  结果是这条渲染路径从来没被自动验过——改了 JS 只能靠人眼看。
 *
 *  这里起一个桩接口，喂一份结构完全真实的假数据，让 check.js 从头渲染到尾：
 *  不联网、不花钱、不写库（落库在路由里，桩接口直接跳过）。
 *
 *  重点盯三件事：
 *    1. 接口联网分那张卡有没有出数字，而不是 undefined/undefined
 *    2. 维度是不是中文、有没有真的渲染出格子
 *    3. 「截图」「手动补测」这些已经下线的字样有没有死灰复燃
 *
 *  注意：巡检在跑的时候不要执行——共用同一个 Chrome profile。
 *
 *  用法：node scripts/diagnose-check-flow.js
 */
const http = require('http')
const path = require('path')
const fs = require('fs')

const BRAND_WEB = path.resolve(__dirname, '../../brand-web')
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

const BROWSER_RUN_ID = 'gcr_browser_smoke'

/** 一次跑完的浏览器巡检：地基测到了，可见性因为没登录态没测到 */
function cannedJob() {
  return {
    runId: BROWSER_RUN_ID,
    status: 'done',
    progress: { done: 18, total: 18, current: '' },
    score: {
      score: 78,
      measuredScope: 'foundation',
      visibilityScore: null,
      foundationScore: 78,
      coverageRate: 0,
      confidence: 100,
      validPlatforms: 3,
      plannedPlatforms: 3,
      dimensions: {
        foundation: {
          hitRate: { raw: 26, max: 30, note: '带店名查询 14 次，12 次在结果里找到了这家店' },
          firstRank: { raw: 30, max: 30, note: '首次命中的位次中位数第 1 条' },
          sourceQuality: { raw: 13, max: 25, note: '命中来源：工商黄页 35、其他 32、本地生活/汽车垂直 2' },
          sourceBreadth: { raw: 15, max: 15, note: '命中来源 20 个' },
        },
        visibility: { note: '本轮没有可用的大模型回执（多半是登录态过期），可见性未测' },
      },
    },
    items: [
      {
        id: 'a1',
        platform: 'baidu_web',
        platformLabel: '百度网页',
        status: 'ok',
        mentioned: true,
        question: '杭州××汽车维修有限公司 怎么样',
        citedUrls: [
          { rank: 1, title: '杭州××汽车维修有限公司 - 官方网站', domain: 'example.com' },
          { rank: 2, title: '杭州××汽车维修有限公司 - 工商信息', domain: 'qcc.com' },
          { rank: 3, title: '杭州××汽车维修有限公司 - 招聘', domain: 'zhaopin.com' },
          { rank: 4, title: '杭州××汽车维修 - 大众点评', domain: 'dianping.com' },
        ],
      },
      {
        id: 'a2',
        platform: 'bing_web',
        platformLabel: '必应',
        status: 'ok',
        mentioned: false,
        question: '杭州××汽车维修有限公司 地址',
        citedUrls: [{ rank: 1, title: '其他同名企业', domain: 'example.org' }],
      },
      // 抓失败的回执 mentioned 必须是 null，页面只能写「未判定」
      {
        id: 'a3',
        platform: 'doubao_web',
        platformLabel: '豆包',
        status: 'login_required',
        mentioned: null,
        question: '杭州底盘异响常见原因有哪些？',
        errorMessage: '需要登录，请先执行 npm run geo:probe:login',
        citedUrls: [],
      },
    ],
    terminatedPlatforms: [{ label: '豆包', status: 'login_required', message: '需要登录，请先执行 npm run geo:probe:login' }],
  }
}

/** 结构对齐真实 geo-check 返回；数字是假的，形状是真的 */
function cannedReport() {
  return {
    overall: 'mixed',
    disclaimer: '接口通道是公开检索抽样；浏览器通道是真机实测。三个分各算各的，谁也不顶替谁。',
    layer1: {
      web: {
        status: 'ok',
        ecosystemFound: true,
        note: '百度网页检索命中 8 条，其中 3 条名称对得上',
        hits: [
          { title: '杭州××汽车维修有限公司 - 官方网站', url: 'https://example.com/a', sourceLabel: '官网' },
          { title: '杭州××汽车维修有限公司 - 工商信息', url: 'https://www.qcc.com/firm/x', sourceLabel: '工商黄页' },
          { title: '杭州××汽车维修· 用户评价', url: 'https://example.com/c', sourceLabel: '本地生活' },
        ],
      },
      map: {
        status: 'ok',
        found: true,
        matchedName: true,
        note: '高德地图有这个点',
        items: [{ name: '杭州××汽车维修', address: '杭州市滨江区××路 12 号' }],
      },
      qwen: { status: 'ok', ecosystemFound: true, sources: [{ title: '阿里云社区相关回答', url: 'https://example.com/q', sourceLabel: '阿里系' }] },
      hunyuan: { status: 'ok', ecosystemFound: false, ecosystemHits: [] },
      doubao: { status: 'ok', ecosystemFound: false },
      official: {
        status: 'ok',
        note: '认定到一个官网候选',
        chosen: { url: 'https://example.com/a', title: '杭州××汽车维修有限公司' },
        audit: {
          checks: [
            { label: '标题含企业名', ok: true },
            { label: 'JSON-LD 结构化数据', ok: false },
            { label: '联系电话可抓取', ok: true },
          ],
        },
        otherCandidates: [{ title: '另一个同名站点', url: 'https://example.com/b', sourceLabel: '其他' }],
      },
      gaps: ['官网缺 JSON-LD 结构化数据', '腾讯系检索没摸到自家站点'],
    },
    ranking: {
      runId: 'gcr_smoke0001',
      targetId: 'gct_smoke0001',
      score: 72,
      coverageRate: 50,
      confidence: 75,
      dimensions: {
        visibility: {
          mention: { raw: 30, max: 50, note: '有效回执 4 条，其中 2 条提到该店' },
          position: { raw: 18, max: 30, note: '按首次出现的字符位次算，越靠前越高' },
          accuracy: { raw: 12, max: 20, note: '按名称对得上、引用来源对得上的比例算' },
        },
        // 接口通道按 chat 型处理，地基块只有一句 note——这正是要验的分支
        foundation: { note: '本轮没有可用的搜索引擎回执，地基未测' },
      },
    },
    step2: {
      title: '浏览器自动巡检 · 真机跑一遍，看车主实际看得到什么',
      prompts: {
        questions: [
          '杭州底盘异响常见原因有哪些，到店该怎么说？',
          '杭州汽车保养一般要注意哪些项目？',
          '杭州钣金喷漆怎么判断做工靠不靠谱？',
        ],
        note: '问题按城市与行业生成，不带店名。',
      },
      note: '程序自己开浏览器，分两路查，全程自动抓取，不需要截图。',
    },
    quota: { allowed: true, used: 1, limit: 20 },
  }
}

function startApiStub() {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0]
    // 页面和接口跑在两个端口上，是跨域请求；不回 CORS 头的话浏览器直接把响应吞掉，
    // 页面只会报「网络不通」，看不出到底是页面错还是接口错。
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors)
      return res.end()
    }
    const send = (code, payload) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...cors })
      res.end(JSON.stringify(payload))
    }
    if (url.endsWith('/geo-check/status')) {
      return send(200, { code: 0, message: 'ok', data: { canRunPartial: true, channels: {}, dailyLimit: 20 } })
    }
    if (url.endsWith('/geo-check/browser/status')) {
      return send(200, {
        code: 0,
        message: 'ok',
        data: {
          ready: true,
          reason: '',
          profile: { hasCookieDb: false },
          platforms: [
            { id: 'baidu_web', label: '百度网页', needsLogin: false },
            { id: 'so_web', label: '360 搜索', needsLogin: false },
            { id: 'bing_web', label: '必应', needsLogin: false },
            { id: 'doubao_web', label: '豆包', needsLogin: true },
          ],
          dailyLimit: 3,
          maxQuestions: 6,
        },
      })
    }
    if (url.endsWith('/geo-check/browser') && req.method === 'POST') {
      return send(200, {
        code: 0,
        message: 'ok',
        data: { runId: BROWSER_RUN_ID, status: 'running', quota: { allowed: true }, questions: [], platforms: ['baidu_web', 'so_web', 'bing_web'] },
      })
    }
    if (url.includes('/geo-check/run/')) {
      return send(200, { code: 0, message: 'ok', data: cannedJob() })
    }
    if (url.endsWith('/geo-check') && req.method === 'POST') {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => send(200, { code: 0, message: 'ok', data: cannedReport() }))
      return
    }
    send(404, { code: 100004, message: '桩接口没这个路由', data: null })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

function startStatic() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0])
    if (rel === '/favicon.ico') {
      res.writeHead(204)
      return res.end()
    }
    const file = rel === '/' ? path.join(BRAND_WEB, 'check.html') : path.join(BRAND_WEB, rel)
    if (!file.startsWith(BRAND_WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404)
      return res.end('not found')
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function main() {
  const api = await startApiStub()
  const web = await startStatic()
  const API = `http://127.0.0.1:${api.address().port}/api/v1/public/geo-check`
  const PAGE = `http://127.0.0.1:${web.address().port}/check.html?api=${encodeURIComponent(API)}`
  console.log(`桩接口：${API}`)
  console.log(`页面：${PAGE}`)

  const playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright-core')
  const { launchPersistentContext } = require('../src/services/geo-browser-probe/session')
  const { context } = await launchPersistentContext(playwright)
  const page = await context.newPage()

  const errors = []
  page.on('pageerror', (err) => errors.push(String(err.message)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
  })

  await page.goto(PAGE, { waitUntil: 'domcontentloaded' })
  await page.fill('#companyName', '杭州××汽车维修有限公司')
  await page.fill('#city', '杭州')
  await page.fill('#industry', '汽修')
  await page.click('#submitBtn')
  await page.waitForSelector('#result .card', { timeout: 15000 })
  await page.waitForTimeout(800)

  const result = await page.locator('#result').innerText()
  console.log('\n=========== 体检结果渲染 ===========\n')
  console.log(result)

  console.log('\n=========== 断言 ===========')
  const checks = [
    ['接口联网分出了数字', /接口联网分（这一路不用浏览器）\s*\n?\s*72 \/ 100/.test(result)],
    ['维度渲染成中文且带分数', /被提到 30\/50/.test(result) && /位次 18\/30/.test(result) && /准确度 12\/20/.test(result)],
    ['没有 undefined/undefined', !/undefined/.test(result)],
    ['浏览器巡检卡在', /浏览器自动巡检/.test(result) && /不带店名的业务问题/.test(result)],
    ['列出了要问的问题', /杭州底盘异响常见原因有哪些/.test(result)],
    ['截图入口已下线', !/截图|手动补测|分析截图/.test(result)],
    ['旧的「第一步/第二步」字样已清', !/第一步|第二步/.test(result)],
  ]
  let failed = 0
  for (const [label, pass] of checks) {
    if (!pass) failed++
    console.log(`  ${pass ? '通过' : '失败'}  ${label}`)
  }

  // 第二段：点「开始自动巡检」，走轮询 → 出分 → 双分数对照。
  // 这才是门店真正会盯着看的那一屏，比第一段重要得多。
  console.log('\n=========== 浏览器巡检结果渲染 ===========\n')
  await page.click('#probeBtn')
  await page.waitForSelector('#probe-result .card', { timeout: 20000 })
  await page.waitForTimeout(800)
  const probe = await page.locator('#probe-result').innerText()
  console.log(probe)

  console.log('\n=========== 断言（浏览器通道）===========')
  const probeChecks = [
    ['分数标签跟着实测范围走（只测了地基）', /网页实测地基分\s*\n?\s*78 \/ 100/.test(probe)],
    ['可见性没测就写「未测」，不拿 0 顶替', /未测\s*\n?\s*AI 可见性/.test(probe)],
    ['明确说明不会拿地基分顶替', /不会拿地基分顶替/.test(probe)],
    ['地基四维度渲染成中文', /命中率 26\/30/.test(probe) && /首条位次 30\/30/.test(probe) && /来源质量 13\/25/.test(probe) && /来源广度 15\/15/.test(probe)],
    ['没跑完的平台单列', /这一轮没跑完的平台/.test(probe) && /豆包：login_required/.test(probe)],
    ['没跑完不等于没被提到', /没跑完的不会当成「没被提到」/.test(probe)],
    ['抓失败的回执写「未判定」', /未判定/.test(probe)],
    ['搜索证据里工商黄页标了出来', /工商黄页|qcc\.com/.test(probe)],
    ['没有 undefined', !/undefined/.test(probe)],
  ]
  for (const [label, pass] of probeChecks) {
    if (!pass) failed++
    console.log(`  ${pass ? '通过' : '失败'}  ${label}`)
  }

  if (errors.length) {
    console.log('\n--- JS 报错 ---')
    ;[...new Set(errors)].slice(0, 10).forEach((item) => console.log('  ' + item))
  } else {
    console.log('\n无 JS 报错')
  }

  await context.close()
  api.close()
  web.close()
  process.exit(failed || errors.length ? 1 : 0)
}

main().catch((err) => {
  console.error('流程诊断失败：', err.message)
  process.exit(1)
})
