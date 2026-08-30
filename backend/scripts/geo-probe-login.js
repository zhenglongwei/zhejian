#!/usr/bin/env node
/**
 * GEO 浏览器巡检 · 登录态初始化
 *
 * 用法
 *   npm run geo:probe:login                 # 登录全部需要登录的平台
 *   npm run geo:probe:login -- doubao tongyi  # 只登录指定平台
 *
 * 流程
 *   1. 非无头打开本机 Chrome（用持久化 profile，关掉后 cookie 仍在）
 *   2. 逐个打开需要登录的平台，等着你扫码 / 输手机号
 *   3. 脚本每 3 秒探测一次，登录墙消失即判定成功，自动进下一个
 *   4. 全部完成后关闭浏览器，profile 落盘
 *
 * 为什么不做自动重登
 *   自动重登要么存明文账号密码，要么接打码平台，成本和风险都远超收益。
 *   登录态过期时巡检会明确报 login_required 并跳过该平台，不会拿未登录画面充数。
 */

const { resolvePlatforms } = require('../src/services/geo-browser-probe/platforms')
const {
  detectLoginWall,
  detectCaptcha,
  launchPersistentContext,
  profileStatus,
} = require('../src/services/geo-browser-probe/session')

const POLL_MS = 3000
const PER_PLATFORM_WAIT_MS = Number(process.env.GEO_BROWSER_LOGIN_WAIT_MS || 5 * 60 * 1000)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function loginOne(page, platform) {
  console.log(`\n[${platform.label}] 打开 ${platform.url}`)
  await page.goto(platform.url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
  await sleep(2500)

  const deadline = Date.now() + PER_PLATFORM_WAIT_MS
  while (Date.now() < deadline) {
    const captcha = await detectCaptcha(page, platform)
    if (captcha) {
      console.log(`  ⚠ 检测到风控：${captcha}。请手动过一下，脚本继续等。`)
      await sleep(POLL_MS)
      continue
    }
    const wall = await detectLoginWall(page, platform)
    if (!wall) {
      console.log(`  ✓ 已登录`)
      return true
    }
    const left = Math.round((deadline - Date.now()) / 1000)
    process.stdout.write(`  … 等待登录（剩余 ${left}s）\r`)
    await sleep(POLL_MS)
  }
  console.log(`  ✗ 超时未登录，跳过。稍后可重跑本脚本补登。`)
  return false
}

async function main() {
  const only = process.argv.slice(2).map((item) => item.toLowerCase()).filter(Boolean)
  const { platforms } = resolvePlatforms()
  const targets = platforms.filter((item) => {
    if (item.enabled === false) return false
    if (!item.needsLogin) return false
    if (only.length && !only.includes(item.id)) return false
    return true
  })

  if (!targets.length) {
    console.log('没有需要登录的平台。当前表内所有可用平台均为免登录。')
    return
  }

  console.log(`待登录平台：${targets.map((item) => item.label).join('、')}`)
  console.log(`profile 目录：${profileStatus().dir}`)

  const playwright = require('playwright-core')
  const { context } = await launchPersistentContext(playwright, { headless: false })
  const page = await context.newPage()

  const results = []
  try {
    for (const platform of targets) {
      const ok = await loginOne(page, platform)
      results.push({ id: platform.id, label: platform.label, ok })
    }
  } finally {
    await context.close().catch(() => {})
  }

  console.log('\n==== 结果 ====')
  for (const item of results) {
    console.log(`${item.ok ? '✓' : '✗'} ${item.label}`)
  }
  const failed = results.filter((item) => !item.ok)
  if (failed.length) {
    console.log(`\n${failed.length} 个平台未登录。巡检时这些平台会标记 login_required 并跳过。`)
  } else {
    console.log('\n全部就绪，可以跑巡检了：npm run geo:probe:status')
  }
}

main().catch((error) => {
  console.error('[geo:probe:login] 失败:', error.message)
  process.exit(1)
})
