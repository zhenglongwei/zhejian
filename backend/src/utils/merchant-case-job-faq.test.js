const assert = require('assert')
const { extractJobFaqs, normalizeFaqItems } = require('./merchant-case-job-faq')

const sections = [
  { key: 'symptom', body: '过减速带异响' },
  { key: 'diagnosis', body: '胶套开裂，球头无旷量' },
  { key: 'plan', body: '无需换总成，压套即可，参考 1280 元' },
  { key: 'process', body: '扭矩打卡' },
  { key: 'handover', body: '旧件已交还，当天开走' },
]

const faqs = extractJobFaqs({ sections })
assert.ok(faqs.some((item) => item.q.includes('做了什么')))
assert.ok(faqs.some((item) => item.q.includes('总成')))
assert.ok(faqs.some((item) => item.q.includes('旧件')))
assert.ok(faqs.some((item) => item.q.includes('开走')))
assert.ok(faqs.every((item) => !/1280|元/.test(item.a)))

const empty = extractJobFaqs({
  sections: [{ key: 'handover', body: '旧件与交车确认以门店留档为准；质保以门店承诺为准。' }],
})
assert.strictEqual(empty.length, 0)

const kept = normalizeFaqItems([
  { q: '这次做了什么？', a: '压套' },
  { q: '这次做了什么？', a: '重复' },
  { q: '', a: '空' },
])
assert.strictEqual(kept.length, 1)

console.log('merchant-case-job-faq.test.js OK')
