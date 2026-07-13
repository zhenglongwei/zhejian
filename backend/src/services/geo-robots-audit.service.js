/**
 * GEO-IGAIN-H08 / GEO-OBS-A07 · robots.txt 审计（GPTBot 等未被误拦）
 */
const { getRobotsTxt } = require('../services/h5-sitemap.service')

const REQUIRED_LINES = [
  'Sitemap:',
  'LLMs-Feed:',
  'LLMs-Full:',
]

const BLOCKED_BOT_RULES = [
  { name: 'GPTBot', pattern: /User-agent:\s*GPTBot[\s\S]*?Disallow:\s*\//i },
  { name: 'Google-Extended', pattern: /User-agent:\s*Google-Extended[\s\S]*?Disallow:\s*\//i },
  { name: 'CCBot', pattern: /User-agent:\s*CCBot[\s\S]*?Disallow:\s*\//i },
]

function auditRobotsTxt(text = '') {
  const robots = String(text || '').trim()
  const missing = REQUIRED_LINES.filter((line) => !robots.includes(line))
  const blockedBots = BLOCKED_BOT_RULES.filter((rule) => rule.pattern.test(robots)).map(
    (rule) => rule.name
  )

  return {
    passed: missing.length === 0 && blockedBots.length === 0,
    missing,
    blockedBots,
    lineCount: robots ? robots.split('\n').length : 0,
  }
}

function auditRobotsTxtFromService() {
  return auditRobotsTxt(getRobotsTxt())
}

module.exports = {
  REQUIRED_LINES,
  auditRobotsTxt,
  auditRobotsTxtFromService,
}
