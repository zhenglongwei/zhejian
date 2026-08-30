/**
 * 临时探针：用同一个持久化 profile 打开通义千问聊天页，
 * 找出「发送按钮」的真实 DOM（class / aria / outerHTML 摘要），
 * 不修改生产代码；只输出到 stdout。
 *
 * 用法：cd backend && node scripts/inspect-tongyi-send.js
 */
const playwright = require('playwright-core')
const { launchPersistentContext } = require('../src/services/geo-browser-probe/session')

;(async () => {
  const { context } = await launchPersistentContext(playwright, { headless: false })
  const page = context.pages()[0] || (await context.newPage())
  await page.goto('https://tongyi.aliyun.com/qianwen/', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(4000)

  const report = await page.evaluate(() => {
    const input = document.querySelector('textarea, div[contenteditable="true"]')
    if (!input) return { error: 'no input found', url: location.href, title: document.title }
    // 从输入框向上找包含 button 的最近容器
    let root = input
    for (let i = 0; i < 8 && root; i++) {
      if (root.querySelectorAll && root.querySelectorAll('button').length > 0) break
      root = root.parentElement
    }
    const scope = root || document
    const buttons = Array.from(scope.querySelectorAll('button, [role="button"]')).map((b, i) => ({
      i,
      tag: b.tagName.toLowerCase(),
      type: b.getAttribute('type'),
      aria: b.getAttribute('aria-label'),
      title: b.getAttribute('title'),
      cls: typeof b.className === 'string' ? b.className.slice(0, 220) : '',
      disabled: b.disabled,
      visible: !!(b.offsetWidth || b.offsetHeight),
      outer: b.outerHTML.slice(0, 260),
    }))
    return {
      url: location.href,
      inputTag: input.tagName.toLowerCase(),
      buttonCount: buttons.length,
      buttons,
    }
  })

  console.log('=== composer buttons ===')
  console.log(JSON.stringify(report, null, 2))

  // 真实发一个问题，等答案流式渲染，再抓答案容器 DOM
  const input = await page.$('textarea, div[contenteditable="true"]')
  await input.click()
  await page.keyboard.type('杭州今天天气怎么样', { delay: 30 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(12000)

  // 顺带抓答案区 DOM：页面上若已有渲染出的回答，枚举疑似正文容器
  const answerReport = await page.evaluate(() => {
    const candidates = []
    const seen = new Set()
    for (const el of document.querySelectorAll('[class]')) {
      const cls = typeof el.className === 'string' ? el.className : ''
      if (!/markdown|answer|message|content|chat|bubble|response/i.test(cls)) continue
      const text = (el.innerText || '').trim()
      if (text.length < 120) continue
      const key = el.tagName + '|' + cls
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push({
        tag: el.tagName.toLowerCase(),
        cls: cls.slice(0, 220),
        len: text.length,
        head: text.slice(0, 60),
      })
      if (candidates.length >= 25) break
    }
    return candidates
  })
  console.log('=== answer container candidates ===')
  console.log(JSON.stringify(answerReport, null, 2))
  await context.close()
  process.exit(0)
})().catch((e) => {
  console.error(e && e.message ? e.message : e)
  process.exit(1)
})