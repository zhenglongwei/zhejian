#!/usr/bin/env node
/**
 * GEO 浏览器巡检 · 命令行入口
 *
 * 用法
 *   npm run geo:probe:browser -- --name "杭州盈简科技" --city 杭州 --industry 汽修
 *   npm run geo:probe:browser -- --file shops.json --limit 10 --platforms so_web,baidu_web
 *   npm run geo:probe:browser -- --name "某某汽修" --dry-run
 *
 * 参数
 *   --name        企业名称（二选一：name 或 file）
 *   --city        城市
 *   --industry    行业，决定用哪套预设问题
 *   --file        JSON / CSV 门店清单，字段 name,city,industry
 *   --limit       只跑前 N 家（默认全跑）
 *   --questions   问题条数上限
 *   --platforms   指定平台，逗号分隔，即访问顺序
 *   --source      SELF（主动体检）或 BATCH（我们公开抽样），默认 BATCH
 *   --dry-run     演练，不真开浏览器
 *   --headless    显式指定是否无头
 */

const fs = require('fs')
const path = require('path')
const { runBrowserProbe } = require('../src/services/geo-browser-probe')
const { resolveQuestions } = require('../src/services/geo-browser-probe/questions')

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next == null || next.startsWith('--')) {
      out[key] = 'true'
    } else {
      out[key] = next
      i += 1
    }
  }
  return out
}

function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const header = lines[0].split(',').map((item) => item.trim())
  const idx = {
    name: header.findIndex((h) => /name|名称|店名|企业/i.test(h)),
    city: header.findIndex((h) => /city|城市|地区/i.test(h)),
    industry: header.findIndex((h) => /industry|行业|类型/i.test(h)),
  }
  return lines.slice(1).map((line) => {
    const cells = line.split(',')
    return {
      name: (cells[idx.name] || '').trim(),
      city: (cells[idx.city] || '').trim(),
      industry: (cells[idx.industry] || '').trim(),
    }
  })
}

function loadTargets(args) {
  if (args.file) {
    const file = path.resolve(process.cwd(), args.file)
    const raw = fs.readFileSync(file, 'utf8')
    const list = file.toLowerCase().endsWith('.json') ? JSON.parse(raw) : parseCsv(raw)
    const limit = Number(args.limit) > 0 ? Number(args.limit) : list.length
    return list
      .map((item) => ({
        name: String(item.name || item.名称 || '').trim(),
        city: String(item.city || item.城市 || '').trim(),
        industry: String(item.industry || item.行业 || '').trim(),
      }))
      .filter((item) => item.name)
      .slice(0, limit)
  }
  if (args.name) {
    return [
      {
        name: String(args.name).trim(),
        city: String(args.city || '').trim(),
        industry: String(args.industry || '').trim(),
      },
    ]
  }
  throw new Error('需要 --name 或 --file')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const targets = loadTargets(args)
  const platformIds = String(args.platforms || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const source = String(args.source || 'BATCH').toUpperCase() === 'SELF' ? 'SELF' : 'BATCH'
  const dryRun = args['dry-run'] === 'true'
  // 老板 2026-08-30 铁律：聊天平台必须看得到窗口，验证码/登录墙由人处理。
  // 没显式传 --headless 时，只要目标里有聊天平台就默认有头（headless=false），
  // 并打日志提醒——避免再次出现「脚本跑了但窗口没开」的乌龙。
  const headlessExplicit = args.headless != null
  const { resolvePlatforms } = require('../src/services/geo-browser-probe/platforms')
  const { platforms: allPlatforms } = resolvePlatforms()
  const selectedPlatforms = allPlatforms.filter((p) => {
    if (p.enabled === false) return false
    if (!platformIds.length) return true
    return platformIds.includes(p.id)
  })
  const hasChat = selectedPlatforms.some((p) => p.type === 'chat')
  const headless = headlessExplicit ? args.headless === 'true' : !hasChat
  if (!headlessExplicit && hasChat) {
    console.log('⚠ 检测到聊天平台，默认有头运行（--headless false）；浏览器窗口会弹在屏幕上。')
  }
  if (!headlessExplicit && !hasChat) {
    console.log('（搜索型平台默认无头，headless=true）')
  }
  // 门店之间的冷却。巡检是连续打同一个搜索引擎，风控看的是「单位时间的请求数」，
  // 不是「总请求数」。13 家门店一口气跑完和分三批跑，被封的概率差一个量级。
  // 默认 45 秒；撞上验证码会自动翻倍，给风控衰减的时间。
  const cooldownMs = Number(args.cooldown) >= 0 ? Number(args.cooldown) * 1000 : 45000

  console.log(`待巡检 ${targets.length} 家，来源标记 ${source}${dryRun ? '（演练）' : ''}`)
  if (cooldownMs) console.log(`门店间隔冷却 ${Math.round(cooldownMs / 1000)} 秒`)

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i]
    const { questions, namedQuestions, source: qSource } = resolveQuestions({
      city: target.city,
      industry: target.industry || '汽修',
      name: target.name,
      count: Number(args.questions) || undefined,
    })

    console.log(
      `\n[${i + 1}/${targets.length}] ${target.name} ${target.city} — ` +
        `不带名 ${questions.length} 题 / 带名 ${namedQuestions.length} 题（${qSource}）`,
    )
    const result = await runBrowserProbe({
      target: { ...target, source },
      questions,
      namedQuestions,
      platformIds: platformIds.length ? platformIds : undefined,
      dryRun,
      headless,
      onProgress: (evt) => {
        if (evt.type === 'answer') {
          process.stdout.write(`  ${evt.platform} ${evt.status} (${evt.done}/${evt.total})\r`)
        }
      },
    })

    console.log(`  run=${result.runId} status=${result.status} ok=${result.ok} failed=${result.failed}`)
    const sc = result.score
    if (sc) {
      console.log(
        `  总分 ${sc.score}（可见性 ${sc.visibilityScore ?? '未测'} / 地基 ${sc.foundationScore ?? '未测'}）` +
          ` 置信度 ${sc.confidence}%`,
      )
    } else if (result.scoreError) {
      console.log(`  评分失败: ${result.scoreError}`)
    }
    let risky = false
    for (const p of result.terminatedPlatforms || []) {
      console.log(`  ⚠ ${p.label} 终止：${p.status} — ${p.message}`)
      if (p.status === 'captcha' || p.status === 'login_required') risky = true
    }

    if (i < targets.length - 1) {
      const wait = risky && cooldownMs ? cooldownMs * 2 : cooldownMs
      if (wait) {
        const sec = Math.round(wait / 1000)
        console.log(`  ${risky ? '撞上风控，延长冷却' : '冷却'} ${sec} 秒…`)
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
    }
  }
  console.log('\n完成。')
  if (String(process.env.GEO_BROWSER_KEEP_OPEN || '').trim() === '1') {
    console.log('GEO_BROWSER_KEEP_OPEN=1：浏览器保持开启，检查完后在这里按 Ctrl+C 结束。')
    setInterval(() => {}, 60000)
  }
}

main().catch((error) => {
  console.error('[geo:probe:browser] 失败:', error.message)
  process.exit(1)
})
