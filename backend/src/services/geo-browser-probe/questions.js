/**
 * GEO-OBS-C09 · 预设问题库
 *
 * 两个来源，可配置优先：
 *   1. config/geo-probe-questions.json（外部维护，随时改，不用发版）
 *   2. 本文件的行业默认模板
 *
 * 题库分两组，按平台类型分流，不能混用：
 *
 *   namedQuestions（带店名）→ search 型平台
 *     测的是「车主已经听说这家店，去搜它，搜出来的是什么」。
 *     搜索引擎的强项就是拿名字搜，让它回答「杭州底盘异响怎么办」等于让鱼爬树——
 *     只会返回一堆通用文章，13 家门店因此拿了一模一样的 17 分。
 *
 *   questions（不带店名）→ chat 型平台
 *     测的是「车主不问店名时，AI 会不会主动想到这家店」。
 *     这一组里绝不能出现店名，题里带名字等于直接给答案，测出来的分是自欺欺人。
 *
 * 两组混在一起的代价：把「搜得到」当成「被 AI 推荐」，
 * 门店拿这个分数去 AI 那里一对，发现和榜单对不上，榜单和公司信誉一起完蛋。
 */

const path = require('path')
const fs = require('fs')

const CONFIG_FILE_ENV = 'GEO_BROWSER_QUESTION_FILE'
const DEFAULT_CONFIG_FILE = 'config/geo-probe-questions.json'

/** 不带店名，给 chat 型平台（豆包/通义/元宝）：测 AI 会不会主动想到这家店 */
const DEFAULT_TEMPLATES = {
  auto_repair: [
    '{city}汽车保养一般要做哪些项目',
    '{city}底盘异响常见原因有哪些',
    '{city}钣金喷漆怎么看做工好不好',
    '{city}变速箱顿挫去哪里修比较靠谱',
    '{city}修车怎么挑门店，网上该看什么',
    '{city}换刹车片大概要注意什么',
    '{city}汽车空调不制冷一般是什么问题',
    '{city}事故车维修该看过程记录还是只看报价',
    '{city}发动机故障灯亮了要马上去修吗',
    '{city}汽修店价格差异大，怎么判断有没有被坑',
  ],
  geo: [
    '{city}做 GEO 优化该先补哪类公开资料',
    '{city}用户会怎么问 AI 才能找到本地服务商',
    '{city}门店怎么才能被 AI 问答提到',
    '{city}地图百科官网缺一样影响大吗',
    '{city}怎么判断 GEO 服务是在补真实资料',
  ],
  generic: [
    '{city}找{industry}服务，客户最常问什么',
    '{city}{industry}怎么判断靠不靠谱',
    '{city}做{industry}之前该先查到哪些公开信息',
    '{city}{industry}常见坑有哪些',
    '{city}选{industry}服务商更看案例还是广告',
  ],
}

/**
 * 带店名，给 search 型平台（百度/360/必应）：测品牌词被搜到时的呈现。
 *
 * 排版成 5 个角度：裸名、评价、联系、价格、官网。
 * 覆盖车主搜一家店时真正会问的东西，也覆盖门店最该补的公开资料缺口。
 */
const NAMED_TEMPLATES = {
  auto_repair: [
    '{name}',
    '{name} 怎么样',
    '{shortName} 地址 电话 营业时间',
    '{shortName} 修车贵不贵 价格',
    '{shortName} 口碑 评价 靠谱吗',
    '{shortName} 官网 案例',
  ],
  geo: [
    '{name}',
    '{name} 是做什么的',
    '{shortName} 联系方式',
    '{shortName} 怎么样 可靠吗',
    '{shortName} 案例 客户',
    '{shortName} 官网',
  ],
  generic: [
    '{name}',
    '{name} 怎么样',
    '{shortName} 地址 电话',
    '{shortName} 口碑 评价',
    '{shortName} 价格 收费',
    '{shortName} 官网',
  ],
}

function industryBucket(industry) {
  const text = String(industry || '')
  if (/汽修|汽车|保养|维修|钣金|底盘|轮胎|美容/.test(text)) return 'auto_repair'
  if (/geo|搜索可见|大模型|问答|收录|优化/i.test(text)) return 'geo'
  return 'generic'
}

/**
 * 去掉城市前缀后的店名。
 * 「杭州德艺行汽车服务有限公司」→「德艺行汽车服务有限公司」
 * 用来拼「{city}{shortName}」这类题，不然会出来「杭州杭州德艺行」这种鬼话。
 */
function shortNameOf(name, city) {
  const raw = String(name || '').trim()
  let out = raw
  if (city && out.startsWith(city)) out = out.slice(city.length)
  return out.length >= 2 ? out : raw
}

function renderTemplate(template, ctx) {
  return (
    String(template || '')
      .replace(/\{city\}/g, ctx.city || '')
      .replace(/\{name\}/g, ctx.name || '')
      .replace(/\{shortName\}/g, ctx.shortName || ctx.name || '')
      .replace(/\{industry\}/g, ctx.industry || '这个行业')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}

/**
 * 从外部配置里取出两组模板。
 * 支持三种写法，都试一遍，避免写错格式时静默失效——
 * 静默失效最坑：配置文件看着生效了，实际一个平台都没被覆盖。
 *   { questions: [...], namedQuestions: [...] }
 *   { templates: { auto_repair: [...] } }                       // 只覆盖不带名那组
 *   { templates: { auto_repair: { questions, namedQuestions } } }
 */
function pickTemplates(external, bucket) {
  const rootPlain = Array.isArray(external?.questions) ? external.questions : null
  const rootNamed = Array.isArray(external?.namedQuestions) ? external.namedQuestions : null

  const bucketValue = external?.templates?.[bucket]
  let bucketPlain = null
  let bucketNamed = null
  if (Array.isArray(bucketValue)) {
    bucketPlain = bucketValue
  } else if (bucketValue && typeof bucketValue === 'object') {
    if (Array.isArray(bucketValue.questions)) bucketPlain = bucketValue.questions
    if (Array.isArray(bucketValue.namedQuestions)) bucketNamed = bucketValue.namedQuestions
  }

  const usingFile = Boolean(rootPlain || rootNamed || bucketPlain || bucketNamed)
  return {
    plain: rootPlain || bucketPlain || DEFAULT_TEMPLATES[bucket] || DEFAULT_TEMPLATES.generic,
    named: rootNamed || bucketNamed || NAMED_TEMPLATES[bucket] || NAMED_TEMPLATES.generic,
    source: usingFile ? 'file' : 'default',
  }
}

function resolveConfigFile() {
  const fromEnv = String(process.env[CONFIG_FILE_ENV] || '').trim()
  if (fromEnv) return fromEnv
  return path.resolve(__dirname, '../../..', DEFAULT_CONFIG_FILE)
}

function readJsonIfExists(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * 解析本次巡检要问的问题，两组一起返回。
 *
 * @param {object} options
 * @param {string} options.city
 * @param {string} options.industry
 * @param {string} [options.name]       目标企业名，带名题组要用
 * @param {number} [options.count]      每组各取前 N 条
 * @param {string[]} [options.override] 只覆盖不带名那组（调用方直接指定，优先级最高）
 * @returns {{questions: string[], namedQuestions: string[], source: string, configFile: string, bucket: string}}
 */
function resolveQuestions(options = {}) {
  const city = String(options.city || '').trim() || '本地'
  const industry = String(options.industry || '').trim()
  const name = String(options.name || '').trim()
  const shortName = shortNameOf(name, city)

  if (Array.isArray(options.override) && options.override.length) {
    return {
      questions: options.override.map((item) => String(item).trim()).filter(Boolean),
      namedQuestions: [],
      source: 'override',
      configFile: '',
      bucket: industryBucket(industry),
    }
  }

  const file = resolveConfigFile()
  const external = readJsonIfExists(file)
  const bucket = industryBucket(industry)
  const { plain, named, source } = pickTemplates(external, bucket)

  const ctx = { city, industry, name, shortName }
  const render = (list) => list.map((item) => renderTemplate(item, ctx)).filter(Boolean)
  const limit = Number(options.count) > 0 ? Number(options.count) : Infinity

  return {
    questions: render(plain).slice(0, limit),
    // 没有企业名就没法出带名题。返回空数组，由 runner 决定怎么退让，
    // 这里不硬塞一个 '{name}' 进去——那会在搜索框里搜出个空词。
    namedQuestions: name ? render(named).slice(0, limit) : [],
    source,
    configFile: file,
    bucket,
  }
}

module.exports = {
  resolveQuestions,
  DEFAULT_TEMPLATES,
  NAMED_TEMPLATES,
  industryBucket,
  shortNameOf,
  renderTemplate,
  resolveConfigFile,
}
