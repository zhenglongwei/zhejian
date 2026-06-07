/**
 * B-TRACK-04：已知搜索/AI 爬虫 UA（代理指标，非 AI 引用次数）
 * @see docs/00_开发计划.md §7.3.4
 */
const CRAWLER_UA_PATTERNS = [
  { type: 'gptbot', pattern: /GPTBot/i },
  { type: 'chatgpt-user', pattern: /ChatGPT-User/i },
  { type: 'claudebot', pattern: /ClaudeBot|anthropic-ai/i },
  { type: 'googlebot', pattern: /Googlebot/i },
  { type: 'bingbot', pattern: /bingbot/i },
  { type: 'baiduspider', pattern: /Baiduspider/i },
  { type: 'sogou', pattern: /Sogou/i },
  { type: '360spider', pattern: /360Spider/i },
  { type: 'bytespider', pattern: /Bytespider/i },
  { type: 'perplexitybot', pattern: /PerplexityBot/i },
  { type: 'applebot', pattern: /Applebot/i },
  { type: 'meta-external', pattern: /meta-externalagent|FacebookBot/i },
]

const CRAWLER_EVENT_NAME = 'h5_crawler_view'

module.exports = {
  CRAWLER_UA_PATTERNS,
  CRAWLER_EVENT_NAME,
}
