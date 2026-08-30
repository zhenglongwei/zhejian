#!/usr/bin/env node
/**
 * GEO 浏览器巡检 · 环境自检
 *
 * 用法：npm run geo:probe:status
 *
 * 上线前先看这个。浏览器不可用不影响接口联网通道，
 * 但「网页版实测」入口必须藏起来，不能让用户点了才发现跑不动。
 */

const { browserProbeStatus } = require('../src/services/geo-browser-probe')

function main() {
  const s = browserProbeStatus()
  console.log('== GEO 浏览器巡检环境 ==')
  console.log(`playwright-core : ${s.installed ? '已安装' : '未安装'}`)
  console.log(`本机浏览器      : ${s.browser || '未找到'}${s.browserSource ? ` (${s.browserSource})` : ''}`)
  console.log(`平台配置        : ${s.configSource} (${s.configFile})`)
  console.log(`profile 目录    : ${s.profile.dir}`)
  console.log(
    `profile 状态    : ${s.profile.exists ? `已存在，${s.profile.fileCount} 个文件，${s.profile.sizeKb}KB` : '尚未创建'}`,
  )
  console.log(
    `cookie 库       : ${s.profile.hasCookieDb ? '已存在（登录过）' : '不存在（还没登录）'}`,
  )
  console.log('')
  console.log('== 平台表（按访问顺序）==')
  for (const p of s.platforms) {
    const flag = p.needsLogin ? '需登录' : '免登录'
    console.log(`  ${p.id.padEnd(12)} ${p.type.padEnd(7)} ${flag}  ${p.label}`)
  }
  console.log('')
  console.log(`整体可用        : ${s.ready ? '是' : `否 —— ${s.reason}`}`)

  if (s.ready && !s.profile.hasCookieDb) {
    console.log('\n提示：还没有登录过。需要登录的平台请跑 npm run geo:probe:login')
  }
  process.exit(s.ready ? 0 : 1)
}

main()
