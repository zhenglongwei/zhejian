const { chatCompletion } = require('../lib/dashscope-chat')
const { config } = require('../config')
const { extractJsonObject } = require('../utils/extract-json')

function fallbackQuestions(city, industry) {
  const place = String(city || '').trim() || '本地'
  const field = String(industry || '').trim() || '这个行业'
  if (/汽修|汽车|保养|维修|钣金|底盘/.test(field)) {
    return [
      `${place}汽车保养一般要注意哪些项目？`,
      `${place}底盘异响常见原因有哪些，到店该怎么说？`,
      `${place}钣金喷漆怎么判断做工靠不靠谱？`,
      `${place}事故后维修该看过程记录还是只看报价？`,
      `${place}换刹车片或保养油液，客户最担心什么？`,
      `${place}本地修车怎么挑靠谱门店，网上该看哪些公开资料？`,
    ]
  }
  if (/geo|搜索可见|大模型|问答|收录/i.test(field)) {
    return [
      `${place}做GEO优化，企业最该先补哪类公开资料？`,
      `${place}用户会怎么问AI，才能找到本地服务商？`,
      `${place}内容和官网怎样写，才比较容易在问答里被提到？`,
      `${place}地图、百科、官网缺一样，对本地获客影响大吗？`,
      `${place}怎么判断一家GEO服务是在补真实资料，还是只在写软文？`,
      `${place}本地企业被AI提到时，客户最关心名称和地址对不对吗？`,
    ]
  }
  return [
    `${place}找${field}服务，客户最常问什么？`,
    `${place}${field}怎么判断靠不靠谱？`,
    `${place}做${field}之前，网上该先查到哪些公开信息？`,
    `${place}${field}常见坑有哪些，问AI时该怎么问？`,
    `${place}本地${field}价格和工期，客户一般关心什么？`,
    `${place}选${field}服务商时，更看案例过程还是广告承诺？`,
  ]
}

function stripCompanyName(text, companyName) {
  let out = String(text || '').trim()
  const name = String(companyName || '').trim()
  if (name) out = out.split(name).join('').replace(/\s{2,}/g, ' ').trim()
  return out.replace(/^[,，、。.\s]+|[,，、。.\s]+$/g, '')
}

function sanitizeQuestions(list, companyName, city, industry) {
  const seen = new Set()
  const out = []
  for (const raw of list || []) {
    const cleaned = stripCompanyName(String(raw || ''), companyName)
    if (cleaned.length < 8 || cleaned.length > 80) continue
    if (seen.has(cleaned)) continue
    seen.add(cleaned)
    out.push(cleaned)
  }
  if (out.length >= 4) return out.slice(0, 8)
  const fallback = fallbackQuestions(city, industry).map((item) => stripCompanyName(item, companyName))
  for (const item of fallback) {
    if (out.length >= 6) break
    if (!seen.has(item)) {
      seen.add(item)
      out.push(item)
    }
  }
  return out.slice(0, 8)
}

async function generateBusinessQuestions(options) {
  const city = String(options.city || '').trim()
  const industry = String(options.industry || '').trim()
  const companyName = String(options.companyName || '').trim()
  if (!industry) {
    return { status: 'skipped', reason: 'missing_industry', questions: [], note: '没有填写行业，无法生成业务题。' }
  }

  const fallback = {
    status: 'ok',
    source: 'fallback',
    questions: sanitizeQuestions(fallbackQuestions(city, industry), companyName, city, industry),
    note: '按行业给出常见问法，题里不带这家企业的名字。第二步会由程序自动开浏览器，把这些题逐个提交给各平台并抓答案。',
  }

  const apiKey = config.geoCheck.visionApiKey
  if (!apiKey) return fallback

  try {
    const result = await chatCompletion({
      apiUrl: config.geoCheck.visionApiUrl,
      apiKey,
      model: config.geoLlm?.model || 'qwen3.7-flash',
      temperature: 0.4,
      timeoutMs: Math.min(config.geoCheck.timeoutMs || 45000, 20000),
      messages: [
        {
          role: 'user',
          content: [
            `城市：${city || '未填'}`,
            `行业：${industry}`,
            '请生成该城市、该行业的客户会问大模型的问题，6到8条。',
            '必须是真实用户口吻的业务问题，不要出现任何公司名、店名、品牌名。',
            '不要估价、全网最低、保证修好、好评返现。',
            '不要写成「请介绍某某公司」。',
            '返回 JSON：{"questions":["..."]}',
          ].join('\n'),
        },
      ],
    })
    const parsed = extractJsonObject(result.text) || {}
    const questions = sanitizeQuestions(parsed.questions, companyName, city, industry)
    return {
      status: 'ok',
      source: 'llm',
      questions,
      note: '按这座城市和这个行业生成，题里不带企业名。第二步会由程序自动开浏览器，把这些题逐个提交给各平台并抓答案。',
    }
  } catch {
    return fallback
  }
}

module.exports = { generateBusinessQuestions, fallbackQuestions, stripCompanyName, sanitizeQuestions }
